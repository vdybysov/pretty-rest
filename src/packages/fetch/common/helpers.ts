export const buildUrl = (url: string, query: any) => {
    let result = url
    if (Object.keys(query).length) {
        result += '?' + new URLSearchParams(query).toString()
    }
    return result
}

export const mergeInits = (...[first, second, ...rest]: RequestInit[]): RequestInit => {
    let result = first
    if (second.headers) {
        first.headers = {
            ...(first.headers ?? {}),
            ...second.headers
        }
    }
    for (const init of rest) {
        result = mergeInits(result, init)
    }
    return result
}