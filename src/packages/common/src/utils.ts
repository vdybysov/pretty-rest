import * as ts from "typescript"
import { promises as fs } from "fs"
import * as Path from "path"

const resolveHandlerTypesByFunction = (fn: ts.FunctionDeclaration | ts.ArrowFunction): {
    inputType: ts.TypeNode,
    outputType: ts.TypeNode,
    contextType: ts.TypeNode,
} | undefined => {
    if (fn) {
        return {
            contextType: fn.parameters[0].type,
            inputType: fn.parameters[1]?.type,
            outputType: (fn.type as ts.TypeReferenceNode).typeArguments?.[0] ?? fn.type,
        }
    }
}

export const resolveHandlerTypesByIdentifierName = (file: ts.SourceFile, name: string): {
    inputType: ts.TypeNode,
    outputType: ts.TypeNode,
    contextType: ts.TypeNode,
} | undefined => {
    let fn: ts.FunctionDeclaration | ts.ArrowFunction
    file.forEachChild(child => {
        if (child.kind === ts.SyntaxKind.VariableStatement) {
            const declaration = (child as ts.VariableStatement).declarationList.declarations[0]
            if ((declaration.name as ts.Identifier).text === name) {
                fn = declaration.initializer as ts.ArrowFunction
            }
        } else if (child.kind === ts.SyntaxKind.FunctionDeclaration) {
            const declaration = child as ts.FunctionDeclaration
            if ((declaration.name as ts.Identifier).text === name) {
                fn = (child as ts.FunctionDeclaration)
            }
        }
    })
    return resolveHandlerTypesByFunction(fn)
}

export const getTypeName = (type: ts.Type) => {
    if (!type) {
        console.trace()
    }
    return (type.symbol.declarations[0] as any).name.text
}

export const getPathParamName = (name = '') => {
    const pathParam = name.match(/^\[\w+\]$/)?.[0] ?? ''
    return pathParam.slice(1, pathParam.length - 1)
}

export const getSafeName = (name = '') => name.split('-')
    .map(part => part.split('_'))
    .reduce((list, curr) => [...list, ...curr])
    .filter(part => !!part)
    .map((part, idx) => `${idx === 0 ? part[0].toLowerCase() : part[0].toUpperCase()}${part.slice(1)}`)
    .join('')
    .replace(/[\[\]]/g, '')

export const writeFile = async (path: string, lines: string[]) => {
    await fs.mkdir(Path.parse(path).dir, {
        recursive: true
    })
    await fs.writeFile(path, ts.createPrinter().printFile(ts.createSourceFile(
        path,
        lines.join('\n'),
        ts.ScriptTarget.ESNext
    )))
}

export const typeToString = (program: ts.Program, type: ts.Type) => program.getTypeChecker().typeToString(
    type,
    undefined,
    ts.TypeFormatFlags.UseFullyQualifiedType
)