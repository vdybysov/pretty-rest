import { Endpoint } from "@pretty-rest/common"
import { promises as fs } from "fs"
import * as Path from "path"
import { CodeBlockWriter, Project, ts } from "ts-morph"

export async function generateFetch(root: { endpoint: Endpoint, errors: Error[] }) {

    const { endpoint, errors } = root

    const prj = new Project({
        compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.Latest,
            declaration: true
        }
    })

    const rootDir = Path.join(process.cwd(), 'generated/fetch')

    await fs.rmdir(rootDir, {
        recursive: true
    })

    function generateApiError() {
        const file = prj.createSourceFile(Path.join(rootDir, 'ApiError.ts'))
        file.addStatements(writer => {
            writer.writeLine(`export default class ApiError {`)
            writer.writeLine(`  name: ${errors.map(({ name }) => `"${name}"`).join('|') ?? 'string'}`)
            writer.writeLine(`}`)
        })
        file.emit()
    }

    function writeHandlerType(writer: CodeBlockWriter, { name, inputType, outputType }) {
        const inputArg = inputType ? `input: ${inputType.getText()}, ` : ``
        writer.writeLine(`  ${name}: (${inputArg}initProvider?: () => RequestInit | Promise<RequestInit>) => Promise<${outputType.getText()}>;`)
    }

    function writeHandler(writer: CodeBlockWriter, { name, inputType, outputType, method }, path = '', isRoot: boolean) {
        const isPost = method.toLowerCase() === 'post'
        const inputArg = inputType ? `input: ${inputType.getText()}, ` : ``
        writer.writeLine(`  ${name}: async (${inputArg}initProvider: () => RequestInit | Promise<RequestInit>) => {`)
        writer.writeLine(`      const res = await fetch(`)
        writer.writeLine(`          buildUrl(${path ? `path + '/${path}'` : 'path'}, ${!inputType ? '{}' : 'input'}, ${isPost}), {`)
        writer.writeLine(`              ...(await mergeInitProviders(${isRoot ? '() => rootInit, ' : ''}defaultInitProvider, initProvider)()),`)
        writer.writeLine(`              method: '${method.toUpperCase()}',`)
        if (inputType && isPost) {
            writer.writeLine(`              body: JSON.stringify(input)`)
        }
        writer.writeLine(`      })`)
        writer.writeLine(`      if(res.ok) {`)
        writer.writeLine(`          return (await res.json()) as ${outputType.getText()}`)
        writer.writeLine(`      } else {`)
        writer.writeLine(`          throw await res.json()`)
        writer.writeLine(`      }`)
        writer.writeLine(`  },`)
    }

    function generateEndpoint(endpoint: Endpoint, parentPath = '') {
        const path = `${parentPath ? parentPath + '/' : ''}${endpoint.name}`
        const handlers = Object.entries(endpoint.handlers)
        const file = prj.createSourceFile(Path.join(rootDir, 'client', path, 'index.ts'))
        const clientRootPath = [
            endpoint.name ? '..' : '',
            path.split('/').map(() => '..').join('/')
        ].filter(part => !!part).join('/')
        file.addStatements(writer => {
            writer.writeLine(`import { buildUrl, mergeInitProviders } from "${clientRootPath}/helpers"`)
            endpoint.children.forEach((child) => {
                if (!child.canSimplify) {
                    generateEndpoint(child, path)
                    writer.writeLine(`import ${child.safeName}, { ${child.safeName} as ${child.safeName}Type } from "./${child.name}"`)
                }
            })
            if (endpoint.isRoot) {
                writer.blankLine()
                writer.writeLine(`const rootInit = {`)
                writer.writeLine(`  headers: {`)
                writer.writeLine(`      'Content-Type': 'application/json'`)
                writer.writeLine(`  }`)
                writer.writeLine(`}`)
            }
            writer.blankLine()
            writer.writeLine(`export type ${endpoint.safeName} = {`)
            handlers.forEach(([, handler]) => writeHandlerType(writer, handler))
            endpoint.children.forEach(({ safeName, handlers, canSimplify }) => {
                if (canSimplify) {
                    const [handler] = Object.values(handlers)
                    writeHandlerType(writer, {
                        ...handler,
                        name: safeName
                    })
                } else {
                    writer.writeLine(`  ${safeName}: ${safeName}Type;`)
                }
            })
            writer.writeLine(`}`)
            writer.blankLine()
            writer.writeLine(`export default (path: string, defaultInitProvider?: () => RequestInit | Promise<RequestInit>): ${endpoint.safeName} => ({`)
            handlers.forEach(([, handler]) => writeHandler(writer, handler, '', endpoint.isRoot))
            endpoint.children.forEach(({ name, safeName, handlers, canSimplify }) => {
                if (canSimplify) {
                    const [handler] = Object.values(handlers)
                    writeHandler(writer, {
                        ...handler,
                        name: safeName
                    }, name, endpoint.isRoot)
                } else {
                    const initProvidersArg = endpoint.isRoot ? 'mergeInitProviders(() => rootInit, defaultInitProvider)' : 'defaultInitProvider'
                    writer.writeLine(`  ${safeName}: ${safeName}(path + '/${name}', ${initProvidersArg}),`)
                }
            })
            writer.writeLine(`})`)
        })
        file.emit()
    }

    generateEndpoint(endpoint)
    generateApiError()

    const srcHelpers = prj.addSourceFileAtPath(Path.resolve(
        __dirname.split(Path.sep).map(elem => elem === 'dist' ? 'src/packages' : elem).join(Path.sep),
        '../../common/helpers.ts'
    ))
    srcHelpers.copyToDirectory(Path.join(rootDir)).emit()
}