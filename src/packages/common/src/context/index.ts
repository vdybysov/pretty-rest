import { Type } from "typescript";

export default interface Context {
    name: string
    type?: Type
    parentType?: Type
    filePath: string
}