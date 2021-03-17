import { Context, Endpoint, Error, Method, utils } from "@pretty-rest/common"
import { promises as fs } from "fs"
import * as Path from "path"
import * as ts from "typescript"

export async function resolve(): Promise<{
    endpoint: Endpoint,
    context: Context[],
    errors: Error[]
}> {

    const root = await resolveWithoutTypes()
    await resolveHandlers(root)

    const context = await resolveContext()
    await resolveContextTypes(context)

    return { endpoint: root, errors: await resolveErrors(), context }
}

async function resolveErrors(): Promise<Error[]> {
    const errors: Error[] = []
    for (const file of await fs.readdir('errors')) {
        errors.push({
            name: Path.parse(file).name,
            fields: {}
        })
    }
    return errors
}

async function resolveContext(): Promise<Context[]> {
    const context: Context[] = []
    const dirPath = 'context'
    for (const file of await fs.readdir(dirPath)) {
        context.push({
            name: Path.parse(file).name,
            filePath: Path.join(dirPath, file)
        })
    }
    return context
}



async function resolveContextTypes(context: Context[]) {

    const program = ts.createProgram(context.map(({ filePath }) => filePath), {})

    context.forEach(ctx => {
        const ctxFile = program.getSourceFile(ctx.filePath)
        if (ctxFile) {
            const defExport = ctxFile?.statements
                .find(({ modifiers, kind }) => modifiers?.find(({ kind }) => kind === ts.SyntaxKind.DefaultKeyword)
                    && modifiers?.find(({ kind }) => kind === ts.SyntaxKind.ExportKeyword)) as ts.InterfaceDeclaration
            const provideFn = ctxFile?.statements.find(child => (child as ts.FunctionDeclaration).name?.text === 'provide') as ts.FunctionDeclaration
            ctx.type = program.getTypeChecker().getTypeAtLocation(defExport)
            ctx.parentType = program.getTypeChecker().getTypeFromTypeNode(provideFn.parameters[0].type!)
        }
    })
}

function getAllFilePaths(endpoint: Endpoint): string[] {
    let paths = [endpoint.filePath]
    endpoint.children.forEach(child => paths = [...paths, ...getAllFilePaths(child)])
    return paths
}

async function resolveHandlers(root: Endpoint) {

    const program = ts.createProgram(getAllFilePaths(root), {

    })

    function setHandlers(endpoint: Endpoint) {
        const srcFile = program.getSourceFile(endpoint.filePath)
        if (srcFile) {
            const defExport = srcFile.statements.find(st => st.kind === ts.SyntaxKind.ExportAssignment) as ts.ExportAssignment
            if (defExport) {
                const expression = defExport.expression as ts.ObjectLiteralExpression
                for (const method in Method) {
                    const prop = expression.properties.find(prop => (prop.name as ts.Identifier).text === Method[method])
                    if (prop) {
                        let identifier: ts.Identifier
                        if (prop.kind === ts.SyntaxKind.PropertyAssignment) {
                            identifier = (prop as ts.PropertyAssignment).initializer as ts.Identifier
                        } else {
                            identifier = prop.name as ts.Identifier
                        }
                        const types = utils.resolveHandlerTypesByIdentifierName(srcFile, identifier.text)
                        const { getTypeFromTypeNode } = program.getTypeChecker()
                        if (types) {
                            endpoint.handlers[method] = {
                                method,
                                name: identifier.text,
                                inputType: types.inputType ? getTypeFromTypeNode(types.inputType) : null,
                                outputType: getTypeFromTypeNode(types.outputType),
                                contextType: getTypeFromTypeNode(types.contextType)
                            }
                        }
                    }
                }
            }
        }
        endpoint.canSimplify = !endpoint.children.length && Object.keys(endpoint.handlers).length === 1
        endpoint.children.forEach(setHandlers)
    }

    setHandlers(root)
}

async function resolveWithoutTypes(path = '', name = ''): Promise<Endpoint> {

    const pathParamName = utils.getPathParamName(name)
    const dirPath = Path.join('endpoints', path, name)
    const endpoint: Endpoint = {
        name,
        safeName: utils.getSafeName(pathParamName || name || 'root'),
        isPathParam: !!pathParamName,
        handlers: {},
        children: [],
        canSimplify: false,
        isRoot: !name,
        filePath: Path.join(dirPath, 'index.ts')
    }
    for (const file of await fs.readdir(dirPath)) {
        const filePath = Path.join(dirPath, file)
        if ((await fs.lstat(filePath)).isDirectory()) {
            endpoint.children.push((await resolveWithoutTypes(`${path ? '/' + path : ''}${name}`, file)))
        } else if (file !== 'index.ts') {
            let { name } = Path.parse(file)
            const pathParamName = utils.getPathParamName(name)
            endpoint.children.push({
                name,
                safeName: utils.getSafeName(pathParamName || name),
                isPathParam: !!pathParamName,
                handlers: {},
                children: [],
                canSimplify: false,
                isRoot: false,
                filePath
            })
        }
    }

    return endpoint
}