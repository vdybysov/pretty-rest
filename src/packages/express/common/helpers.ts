import { HttpContext } from "@pretty-rest/common"

export const resolveHttpContext = (request, response): HttpContext => {
    return {
        request
    }
}

export const sendError = (name, error, response) => {
    const { status, ...rest } = error
    response.status(status ?? 500)
    response.json({
        name,
        ...rest
    })
    response.send()
}