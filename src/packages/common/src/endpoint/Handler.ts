import { Type } from "typescript";
import Method from "./Method";

export default interface Handler {
    method: Method
    name: string
    inputType: Type
    outputType: Type
    contextType: Type
}