import { promises as fs } from "fs"
import * as Path from "path"
import { CodeBlockWriter, Project, ts } from "ts-morph"
import { Endpoint, Method } from "@pretty-rest/common"

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

    function writeHandlerType(writer: CodeBlockWriter, { name, inputType, outputType, method }) {
        writer.writeLine(`  ${name}: (input: ${inputType.getText()}, init?: RequestInit) => Promise<${outputType.getText()}>;`)
    }

    function writeHandler(writer: CodeBlockWriter, { name, inputType, outputType, method }, path = '') {
        const isPost = method.toLowerCase() === 'post'
        writer.writeLine(`  ${name}: async (input: ${inputType.getText()}, init: RequestInit = {}) => {`)
        writer.writeLine(`      const url = buildUrl(${path ? `path + '/${path}'` : 'path'}, ${isPost ? '{}' : 'input'}),`)
        writer.writeLine(`      const res = await fetch(url, {`)
        writer.writeLine(`          ...mergeInits(parentInit, defaultInit, init),`)
        writer.writeLine(`          method: '${method.toUpperCase()}',`)
        if (isPost) {
            writer.writeLine(`          body: JSON.stringify(input)`)
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
            writer.writeLine(`import { buildUrl, mergeInits } from "${clientRootPath}/helpers"`)
            endpoint.children.forEach((ep) => {
                if (!ep.canSimplify) {
                    generateEndpoint(ep, path)
                    writer.writeLine(`import ${ep.safeName}, { ${ep.safeName} as ${ep.safeName}Type } from "./${ep.name}"`)
                }
            })
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
                    writer.writeLine(`  ${safeName}: (defaultInit?: RequestInit) => ${safeName}Type;`)
                }
            })
            writer.writeLine(`}`)
            writer.blankLine()
            writer.writeLine(`export default (path: string, parentInit: RequestInit = {}) => (defaultInit: RequestInit = {}): ${endpoint.safeName} => ({`)
            handlers.forEach(([, handler]) => writeHandler(writer, handler))
            endpoint.children.forEach(({ name, safeName, handlers, canSimplify }) => {
                if (canSimplify) {
                    const [handler] = Object.values(handlers)
                    writeHandler(writer, {
                        ...handler,
                        name: safeName
                    }, name)
                } else {
                    writer.writeLine(`  ${safeName}: ${safeName}(path + '/${name}', mergeInits(parentInit, defaultInit)),`)
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