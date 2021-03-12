interface Request {
    headers: Record<string, string | string[]>
}

export default interface HttpContext {
    request: Request
}