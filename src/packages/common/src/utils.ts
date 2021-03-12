import { ArrowFunction, FunctionDeclaration, Identifier, Symbol, ts, Type, VariableDeclaration } from "ts-morph"

const resolveHandlerTypesByFunction = (fn: FunctionDeclaration | ArrowFunction): [Type, Type, Type] | undefined => {
    if (fn) {
        let outputType = fn.getReturnType()
        if (fn.isAsync()) {
            outputType = outputType.getTypeArguments()[0]
        }
        return [
            fn.getParameters()[1].getType(),
            outputType,
            fn.getParameters()[0].getType()
        ]
    }
}

export const resolveHandlerTypesByIdentifier = (identifier: Identifier): [Type, Type, Type] | undefined => {
    let declaration = identifier.getDefinitions()[0].getDeclarationNode()
    if (declaration.getKind() === ts.SyntaxKind.VariableDeclaration) {
        declaration = (declaration as VariableDeclaration).getInitializer()
    }
    return resolveHandlerTypesByFunction(declaration as FunctionDeclaration | ArrowFunction)
}

export const resolveHandlerTypes = (exportSymbol: Symbol): [Type, Type, Type] | undefined => {
    let fn: FunctionDeclaration | ArrowFunction
    const valDecl = exportSymbol.getValueDeclaration()
    if (valDecl) {
        if (valDecl.getKind() === ts.SyntaxKind.FunctionDeclaration || valDecl.getKind() === ts.SyntaxKind.ArrowFunction) {
            fn = valDecl as FunctionDeclaration | ArrowFunction
        } else {
            fn = valDecl.getChildrenOfKind(ts.SyntaxKind.FunctionDeclaration)[0] ?? valDecl.getChildrenOfKind(ts.SyntaxKind.ArrowFunction)[0]
        }
        return resolveHandlerTypesByFunction(fn)
    } else {
        const [identifier] = exportSymbol.getDeclarations()[0].getChildrenOfKind(ts.SyntaxKind.Identifier)
        if (identifier) {
            return resolveHandlerTypesByIdentifier(identifier)
        }
    }
}

export const getTypeName = (type: Type) => type.getSymbol()?.getDeclarations()[0].getChildrenOfKind(ts.SyntaxKind.Identifier)[0].getText()