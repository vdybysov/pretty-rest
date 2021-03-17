import Handler from "./Handler";
import Method from "./Method";

export default interface Endpoint {
    name: string
    safeName: string
    isPathParam: boolean
    handlers: Partial<Record<Method, Handler>>
    children: Endpoint[]
    canSimplify: boolean
    isRoot: boolean
    filePath: string
}