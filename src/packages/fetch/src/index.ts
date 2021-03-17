import { Endpoint, Handler, utils } from "@pretty-rest/common"
import { promises as fs } from "fs"
import * as Path from "path"
import * as ts from "typescript"

export async function generateFetch(root: { endpoint: Endpoint, errors: Error[] }) {

    const { endpoint, errors } = root

    const rootDir = Path.join(process.cwd(), 'generated/fetch')
    const program = ts.createProgram([], {})

    const filesToEmit: ts.SourceFile[] = []

    await fs.rmdir(rootDir, {
        recursive: true
    })

    function generateApiError() {
        const lines: string[] = []
        lines.push(`export default class ApiError {`)
        lines.push(`  name: ${errors.map(({ name }) => `"${name}"`).join('|') ?? 'string'}`)
        lines.push(`}`)
        filesToEmit.unshift(ts.createSourceFile(Path.join(rootDir, 'ApiError.ts'), lines.join('\n'), ts.ScriptTarget.ES2018))
    }

    function generateEndpoint(endpoint: Endpoint, parentPath = '') {

        const lines: string[] = []

        function writeHandlerType({ name, inputType, outputType }: Handler) {
            const inputArg = inputType ? `input: ${utils.typeToString(program, inputType)}, ` : ``
            lines.push(`  ${name}: (${inputArg}initProvider?: () => RequestInit | Promise<RequestInit>) => Promise<${utils.typeToString(program, outputType)}>;`)
        }

        function writeHandler({ name, inputType, outputType, method }: Handler, path = '', isRoot: boolean) {
            const isPost = method.toLowerCase() === 'post'
            const inputArg = inputType ? `input: ${utils.typeToString(program, inputType)}, ` : ``
            lines.push(`  ${name}: async (${inputArg}initProvider: () => RequestInit | Promise<RequestInit>) => {`)
            lines.push(`      const res = await fetch(`)
            lines.push(`          buildUrl(${path ? `path + '/${path}'` : 'path'}, ${!inputType ? '{}' : 'input'}, ${isPost}), {`)
            lines.push(`              ...(await mergeInitProviders(${isRoot ? '() => rootInit, ' : ''}defaultInitProvider, initProvider)()),`)
            lines.push(`              method: '${method.toUpperCase()}',`)
            if (inputType && isPost) {
                lines.push(`              body: JSON.stringify(input)`)
            }
            lines.push(`      })`)
            lines.push(`      if(res.ok) {`)
            lines.push(`          return (await res.json()) as ${utils.typeToString(program, outputType)}`)
            lines.push(`      } else {`)
            lines.push(`          throw await res.json()`)
            lines.push(`      }`)
            lines.push(`  },`)
        }

        const path = `${parentPath ? parentPath + '/' : ''}${endpoint.name}`
        const handlers = Object.entries(endpoint.handlers)
        const clientRootPath = [
            endpoint.name ? '..' : '',
            path.split('/').map(() => '..').join('/')
        ].filter(part => !!part).join('/')
        lines.push(`import { buildUrl, mergeInitProviders } from "${clientRootPath}/helpers"`)
        endpoint.children.forEach((child) => {
            if (!child.canSimplify) {
                generateEndpoint(child, path)
                lines.push(`import ${child.safeName}, { ${child.safeName} as ${child.safeName}Type } from "./${child.name}"`)
            }
        })
        if (endpoint.isRoot) {
            lines.push()
            lines.push(`const rootInit = {`)
            lines.push(`  headers: {`)
            lines.push(`      'Content-Type': 'application/json'`)
            lines.push(`  }`)
            lines.push(`}`)
        }
        lines.push()
        lines.push(`export type ${endpoint.safeName} = {`)
        handlers.forEach(([, handler]) => writeHandlerType(handler))
        endpoint.children.forEach(({ safeName, handlers, canSimplify }) => {
            if (canSimplify) {
                const [handler] = Object.values(handlers)
                writeHandlerType({
                    ...handler,
                    name: safeName
                })
            } else {
                lines.push(`  ${safeName}: ${safeName}Type;`)
            }
        })
        lines.push(`}`)
        lines.push()
        lines.push(`export default (path: string, defaultInitProvider?: () => RequestInit | Promise<RequestInit>): ${endpoint.safeName} => ({`)
        handlers.forEach(([, handler]) => writeHandler(handler, '', endpoint.isRoot))
        endpoint.children.forEach(({ name, safeName, handlers, canSimplify }) => {
            if (canSimplify) {
                const [handler] = Object.values(handlers)
                writeHandler({
                    ...handler,
                    name: safeName
                }, name, endpoint.isRoot)
            } else {
                const initProvidersArg = endpoint.isRoot ? 'mergeInitProviders(() => rootInit, defaultInitProvider)' : 'defaultInitProvider'
                lines.push(`  ${safeName}: ${safeName}(path + '/${name}', ${initProvidersArg}),`)
            }
        })
        lines.push(`})`)
        filesToEmit.push(ts.createSourceFile(Path.join(rootDir, 'client', path, 'index.ts'), lines.join('\n'), ts.ScriptTarget.ES2018))
    }

    await generateEndpoint(endpoint)
    generateApiError()

    filesToEmit.unshift(ts.createSourceFile(Path.resolve(
        rootDir, 'helpers.ts'
    ), (await fs.readFile(Path.resolve(
        __dirname.split(Path.sep).map(elem => elem === 'dist' ? 'src/packages' : elem).join(Path.sep), '../../common/helpers.ts'
    ))).toString(), ts.ScriptTarget.ES2018))

    const printer = ts.createPrinter()

    for (const file of filesToEmit) {
        await fs.mkdir(Path.parse(file.fileName).dir, {
            recursive: true
        })
        await fs.writeFile(file.fileName, printer.printFile(file))
    }

    const host = ts.createCompilerHost({})

    const originalWriteFile = host.writeFile

    host.writeFile = (fileName: string, data: string) => {
        if (filesToEmit.find(file => file.fileName === fileName)) {
            originalWriteFile(fileName, data, false)
        }
    }

    const emitProgram = ts.createProgram(filesToEmit.map(({ fileName }) => fileName), {
        declaration: true,
        target: ts.ScriptTarget.ES5,
        module: ts.ModuleKind.CommonJS
    }, host)

    emitProgram.emit()

    for (const file of filesToEmit) {
        await fs.unlink(file.fileName)
    }

}