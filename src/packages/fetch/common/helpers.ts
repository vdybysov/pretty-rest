export const buildUrl = (url: string, query: any, paramsOnly = false) => {
    let result = url.split('/')
        .map(part => {
            let result = part
            if (/^\[\w+\]$/.test(part)) {
                const paramName = part.slice(1, part.length - 1)
                result = query[paramName]
                query[paramName] = ''
            }
            return result
        })
        .join('/')
    if (!paramsOnly) {
        const entries = Object.entries(query)
            .filter(([, value]) => value !== undefined && value !== null && value !== '')
        if (entries.length) {
            result += '?' + new URLSearchParams(entries.reduce(
                (acc, [key, value]) => ({ ...acc, [key]: value }),
                {}
            )).toString()
        }
    }
    return result
}

export const mergeInits = (...[first, second, ...rest]: RequestInit[]): RequestInit => {
    let result: RequestInit = first ? first : {}
    const secondVal: RequestInit = second ? second : {}
    if (secondVal.headers) {
        result.headers = {
            ...(result.headers ?? {}),
            ...secondVal.headers
        }
    }
    for (const init of rest) {
        result = mergeInits(result, init)
    }
    return result
}

export const mergeInitProviders = (...providers: (() => RequestInit | Promise<RequestInit>)[]): () => Promise<RequestInit> => {
    return async () => {
        let result: RequestInit = {}
        for (const provider of providers) {
            if (provider) {
                result = mergeInits(result, await provider())
            }
        }
        return result
    }
}