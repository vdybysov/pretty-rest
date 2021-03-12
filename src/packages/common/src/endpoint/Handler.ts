import { Type } from "ts-morph";
import Method from "./Method";

export default interface Handler {
    method: Method
    name: string
    inputType: Type
    outputType: Type
    contextType: Type
}