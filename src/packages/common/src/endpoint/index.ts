import Handler from "./Handler";
import Method from "./Method";

export default interface Endpoint {
    name: string
    safeName: string
    handlers: Partial<Record<Method, Handler>>
    children: Endpoint[]
    canSimplify: boolean
}