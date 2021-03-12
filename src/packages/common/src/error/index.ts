import { Type } from "ts-morph";

export default interface Error {
    name: string
    fields: Record<string, Type>
}