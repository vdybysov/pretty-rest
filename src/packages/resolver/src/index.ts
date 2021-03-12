import { Endpoint, Error, Handler, Method, utils } from "@pretty-rest/common"
import toCamelCase from "camelcase"
import { promises as fs } from "fs"
import * as Path from "path"
import { Identifier, ObjectLiteralExpression, Project, PropertyAssignment, ShorthandPropertyAssignment, ts } from "ts-morph"

export async function resolve(path = '', name = ''): Promise<{
    endpoint: Endpoint,
    errors: Error[]
}> {

    const prj = new Project()

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

    function resolveHandlers(file: string) {
        const handlers: Partial<Record<Method, Handler>> = {}
        const srcFile = prj.addSourceFileAtPath(file)
        const defExportObj = (srcFile.getDefaultExportSymbol()
            ?.getValueDeclaration()
            ?.getChildrenOfKind(ts.SyntaxKind.ObjectLiteralExpression)[0] as ObjectLiteralExpression)
            ?.getChildrenOfKind(ts.SyntaxKind.SyntaxList)[0]
            ?.getChildren()
        for (const method in Method) {
            let handlerTypes
            let name = Method[method]
            if (defExportObj) {
                const prop = defExportObj
                    .find(
                        pa => (pa.getKind() === ts.SyntaxKind.PropertyAssignment || pa.getKind() === ts.SyntaxKind.ShorthandPropertyAssignment)
                            && pa.getChildrenOfKind(ts.SyntaxKind.Identifier)[0].getText() === Method[method]
                    ) as PropertyAssignment | ShorthandPropertyAssignment
                if (prop) {
                    const initializer = prop.getInitializer()
                    const identifier = initializer instanceof Identifier ? initializer as Identifier : prop.getChildren()[0] as Identifier
                    handlerTypes = utils.resolveHandlerTypesByIdentifier(identifier)
                    name = identifier.getText()
                    if (!handlerTypes) {
                        console.warn(`Could not resolve handler types for ${prop.getText()} at ${file}`)
                    }
                }
            }
            if (handlerTypes) {
                const [inputType, outputType, contextType] = handlerTypes
                handlers[method] = {
                    method,
                    name,
                    inputType,
                    outputType,
                    contextType
                }
            }
        }
        return handlers
    }

    const endpoint: Endpoint = {
        name,
        safeName: name ? toCamelCase(name) : 'root',
        handlers: {},
        children: [],
        canSimplify: false
    }
    const dirPath = Path.join('endpoints', path, name)
    for (const file of await fs.readdir(dirPath)) {
        const filePath = Path.join(dirPath, file)
        if ((await fs.lstat(filePath)).isDirectory()) {
            endpoint.children.push((await resolve(`${path ? '/' + path : ''}${name}`, file)).endpoint)
        } else if (file === 'index.ts') {
            endpoint.handlers = resolveHandlers(filePath)
        } else {
            const { name } = Path.parse(file)
            const handlers = resolveHandlers(filePath)
            endpoint.children.push({
                name,
                safeName: toCamelCase(name),
                handlers,
                children: [],
                canSimplify: Object.keys(handlers).length === 1
            })
        }
    }
    endpoint.canSimplify = !endpoint.children.length && Object.keys(endpoint.handlers).length === 1
    return { endpoint, errors: await resolveErrors() }
}