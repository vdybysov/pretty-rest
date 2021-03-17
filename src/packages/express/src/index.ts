import { Endpoint, Method, utils, Error, Context } from "@pretty-rest/common"
import { promises as fs } from "fs"
import * as Path from "path"
import * as ts from "typescript"

export async function generateExpress(root: { endpoint: Endpoint, errors: Error[], context: Context[] }) {

    const { endpoint, errors } = root

    const program = ts.createProgram([], {})

    const rootDir = Path.join(process.cwd(), 'generated/express')

    const findContext = (type: ts.Type) => root.context.find(ctx => utils.getTypeName(ctx.type) === utils.getTypeName(type))

    const generateErrorHandler = async () => {
        const lines: string[] = []
        lines.push(`import { sendError } from "./helpers"`)
        errors.forEach(({ name }) => {
            lines.push(`import ${name} from "../../errors/${name}"`)
        })
        lines.push()
        lines.push(`export function handleError(error, response) {`)
        errors.forEach(({ name }) => {
            lines.push(`  if(error instanceof ${name}) {`)
            lines.push(`      sendError('${name}', error, response)`)
            lines.push(`      return`)
            lines.push(`  }`)
        })
        lines.push(`  console.error('Unhandled error:')`)
        lines.push(`  console.error(error)`)
        lines.push(`  sendError('Internal error', {}, response)`)
        lines.push(`}`)
        await utils.writeFile(Path.join(rootDir, 'error-handler.ts'), lines)
    }

    await fs.rmdir(rootDir, {
        recursive: true
    })

    async function generateEndpoint({ name, handlers, children }: Endpoint, parentPath = '') {
        const path = Path.join(parentPath, name)
        const handlerList = Object.entries(handlers)
        const needOneMoreLevelUp = children.length && parentPath
        const lines = []
        const contextResolvers: Context[] = []
        children.forEach((child) => {
            generateEndpoint(child, path)
            lines.push(`import ${child.safeName} from "./${child.name}"`)
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
                .reduce((list: ts.Type[], type) => list.includes(type) ? list : [...list, type], [])
                .filter(type => utils.getTypeName(type) !== 'HttpContext')
            const addContextResolver = (contextType: ts.Type) => {
                const ctx = findContext(contextType)
                if (utils.getTypeName(contextType) === 'HttpContext' || contextResolvers.includes(ctx)) {
                    return
                }
                contextResolvers.push(ctx)
                addContextResolver(ctx.parentType)
            }
            contextTypes.forEach(addContextResolver)
            lines.push(`import { resolveHttpContext } from "${generatedPath}/helpers"`)
            lines.push(`import { handleError } from "${generatedPath}/error-handler"`)
            contextResolvers.forEach(({ name }) => {
                lines.push(`import { provide as provide${name} } from "${rootPath}/context/${name}"`)
            })
            lines.push(`import handlers from "${importPath}"`)
        }
        lines.push()
        contextResolvers.forEach(({ name, parentType }) => {
            const parentName = utils.getTypeName(parentType)
            lines.push(`const resolve${name} = async (req, res) => await provide${name}(await resolve${parentName}(req, res))`)
        })
        lines.push()
        lines.push('export default (routerProvider) => {')
        lines.push('  const _router = routerProvider()')
        handlerList.forEach(([method, { inputType, contextType }]) => {
            lines.push()
            lines.push(`  _router.${method.toLowerCase()} ('/', async (req, res) => { `)
            lines.push(`      try {`)
            lines.push(`          const result = await handlers.${Method[method]}(`)
            lines.push(`              await resolve${utils.getTypeName(contextType)}(req, res),`)
            if (inputType) {
                lines.push(`              { ...req.params, ...req.query ${method === 'Post' ? ', ...req.body' : ''} } as ${utils.typeToString(program, inputType)}`)
            }
            lines.push(`          )`)
            lines.push(`          res.json(result)`)
            lines.push(`      } catch(error) {`)
            lines.push(`          handleError(error, res)`)
            lines.push(`      }`)
            lines.push(`  })`)
        })
        children.forEach(({ safeName, isPathParam }) => {
            lines.push(`  _router.use('/${isPathParam ? ':' : ''}${safeName}', ${safeName}(routerProvider))`)
        })
        lines.push(`  return _router`)
        lines.push(`} `)

        await utils.writeFile(
            children.length ? Path.join(rootDir, 'routes', path, 'index.ts')
                : Path.join(rootDir, 'routes', `${path}.ts`),
            lines
        )
    }

    await generateEndpoint(endpoint)
    generateErrorHandler()

    await fs.copyFile(
        Path.resolve(
            __dirname.split(Path.sep).map(elem => elem === 'dist' ? 'src/packages' : elem).join(Path.sep), '../../common/helpers.ts'
        ),
        Path.resolve(
            rootDir, 'helpers.ts'
        )
    )

}