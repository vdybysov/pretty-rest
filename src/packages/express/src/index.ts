import { Endpoint, Method, utils, Error } from "@pretty-rest/common"
import { promises as fs } from "fs"
import * as Path from "path"
import { ArrowFunction, FunctionDeclaration, Project, Type } from "ts-morph"

export async function generateExpress(root: { endpoint: Endpoint, errors: Error[] }) {

    const { endpoint, errors } = root

    const prj = new Project()

    const rootDir = Path.join(process.cwd(), 'generated/express')

    const generateErrorHandler = () => {
        const srcFile = prj.createSourceFile(Path.join(rootDir, 'error-handler.ts'))
        srcFile.addStatements(writer => {
            writer.writeLine(`import { sendError } from "./helpers"`)
            errors.forEach(({ name }) => {
                writer.writeLine(`import ${name} from "../../errors/${name}"`)
            })
            writer.blankLine()
            writer.writeLine(`export function handleError(error, response) {`)
            errors.forEach(({ name }) => {
                writer.writeLine(`  if(error instanceof ${name}) {`)
                writer.writeLine(`      sendError('${name}', error, response)`)
                writer.writeLine(`      return`)
                writer.writeLine(`  }`)
            })
            writer.writeLine(`  console.error('Unhandled error:')`)
            writer.writeLine(`  console.error(error)`)
            writer.writeLine(`  sendError('Internal error', {}, response)`)
            writer.writeLine(`}`)
        })
        srcFile.save()
    }

    const getContextParentType = (name: string) => {
        const ctxFile = prj.addSourceFileAtPath(Path.join('./context', `${name}.ts`))
        return (
            ctxFile.getExportSymbols()
                ?.find(symbol => symbol.getName() === 'provide')
                ?.getDeclarations()[0] as FunctionDeclaration | ArrowFunction
        )
            .getParameters()[0]
            .getType()
    }

    await fs.rmdir(rootDir, {
        recursive: true
    })

    function generateEndpoint({ name, handlers, children }: Endpoint, parentPath = '') {
        const path = Path.join(parentPath, name)
        const handlerList = Object.entries(handlers)
        const filePath = children.length ? Path.join(rootDir, 'routes', path, 'index.ts')
            : Path.join(rootDir, 'routes', `${path}.ts`)
        const needOneMoreLevelUp = children.length && parentPath
        const srcFile = prj.createSourceFile(filePath)
        const contextResolvers: string[] = []
        srcFile.addStatements(writer => {
            children.forEach((child) => {
                generateEndpoint(child, path)
                writer.writeLine(`import ${child.safeName} from "./${child.name}"`)
            })
            if (handlerList.length) {
                const generatedPath = [
                    needOneMoreLevelUp ? '..' : '',
                    path.split(Path.sep).map(() => '..').join('/'),
                ].filter(part => !!part).join('/')
                const rootPath = `../../${generatedPath}`
                const importPath = [
                    rootPath,
                    'endpoints',
                    parentPath ? path.split(Path.sep).join('/') : ''
                ].filter(part => !!part).join('/')
                const contextTypes = handlerList.map(([, { contextType }]) => contextType)
                    .reduce((list: Type[], type) => list.includes(type) ? list : [...list, type], [])
                    .map(utils.getTypeName)
                    .filter(type => type !== 'HttpContext')
                const addContextResolver = (name: string) => {
                    if (name === 'HttpContext' || contextResolvers.includes(name)) {
                        return
                    }
                    contextResolvers.push(name)
                    addContextResolver(utils.getTypeName(getContextParentType(name)))
                }
                contextTypes.forEach(addContextResolver)
                writer.writeLine(`import { resolveHttpContext } from "${generatedPath}/helpers"`)
                writer.writeLine(`import { handleError } from "${generatedPath}/error-handler"`)
                contextResolvers.forEach(name => {
                    writer.writeLine(`import { provide as provide${name} } from "${rootPath}/context/${name}"`)
                })
                writer.writeLine(`import handlers from "${importPath}"`)
                const typesToImport = handlerList
                    .map(([, { inputType, outputType, contextType }]) => [inputType, outputType, contextType])
                    .reduce((list, curr) => [...list, ...curr.filter(type => type?.getAliasSymbol() && !list.includes(type))], [])
                    .reduce((map, curr) => {
                        const path = curr.getAliasSymbol().getDeclarations()[0].getSourceFile().getBaseName()
                        return {
                            [path]: [...(map[path] ?? []), curr],
                            ...map
                        }
                    }, {})
                for (const path in typesToImport) {
                    const types = typesToImport[path]
                    writer.writeLine(`import { ${types.map(type => type.getAliasSymbol().getName()).join(', ')} } from "${path}"`)
                    //TODO Fix
                }
            }
            writer.blankLineIfLastNot()
            contextResolvers.forEach(name => {
                const parentName = utils.getTypeName(getContextParentType(name))
                writer.writeLine(`const resolve${name} = async (req, res) => await provide${name}(await resolve${parentName}(req, res))`)
            })
            writer.blankLineIfLastNot()
            writer.writeLine('export default (routerProvider) => {')
            writer.writeLine('  const _router = routerProvider()')
            handlerList.forEach(([method, { inputType, contextType }]) => {
                writer.blankLine()
                writer.writeLine(`  _router.${method.toLowerCase()} ('/', async (req, res) => { `)
                writer.writeLine(`      try {`)
                writer.writeLine(`          const result = await handlers.${Method[method]}(`)
                writer.writeLine(`              await resolve${utils.getTypeName(contextType)}(req, res),`)
                if (inputType) {
                    writer.writeLine(`              { ...req.params, ...req.query ${method === 'Post' ? ', ...req.body' : ''} } as ${inputType.getText()}`)
                }
                writer.writeLine(`          )`)
                writer.writeLine(`          res.json(result)`)
                writer.writeLine(`      } catch(error) {`)
                writer.writeLine(`          handleError(error, res)`)
                writer.writeLine(`      }`)
                writer.writeLine(`  })`)
            })
            children.forEach(({ name, safeName, isPathParam }) => {
                writer.writeLine(`  _router.use('/${isPathParam ? ':' : ''}${safeName}', ${safeName}(routerProvider))`)
            })
            writer.writeLine(`  return _router`)
            writer.writeLine(`} `)

        })
        srcFile.save()
    }

    generateEndpoint(endpoint)
    generateErrorHandler()

    const srcHelpers = prj.addSourceFileAtPath(Path.resolve(
        __dirname.split(Path.sep).map(elem => elem === 'dist' ? 'src/packages' : elem).join(Path.sep), '../../common/helpers.ts'
    ))
    srcHelpers.copyToDirectory(rootDir).save()

}