import { Type } from "typescript";

export default interface Error {
    name: string
    fields: Record<string, Type>
}