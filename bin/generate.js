#!/usr/bin/env node

const { Method } = require("../src/packages/common/dist/index.js")
const { resolve } = require("../src/packages/resolver/dist/index.js")
const { generateExpress } = require("../src/packages/express/dist/index.js")
const { generateFetch } = require("../src/packages/fetch/dist/index.js")

function Stopwatch() {
    let time
    const getAndReset = () => {
        const formatted = ((Date.now() - time) / 1000).toFixed(2) + 's'
        time = Date.now()
        return formatted
    }
    getAndReset()
    return { getAndReset }
}

const generators = {
    fetch: generateFetch,
    express: generateExpress
}

function buildEndpointPreview({ name, handlers, children }, level = -1) {
    let preview = ''
    if (level >= 0) {
        preview += Array(level).fill('  ').join('') + '└─'
    }
    preview += (name || '(ROOT)') + '\n'
    const handlerList = Object.values(handlers)
    handlerList.forEach(({ method, name }, idx) => {
        preview += Array(level + 1).fill('  ').join('')
        preview += idx === handlerList.length - 1 && !children.length ? '└─' : '├─'
        preview += method.toUpperCase()
        if (name !== Method[method]) {
            preview += ` (${name})`
        }
        preview += '\n'
    })
    children.forEach(child => preview += buildEndpointPreview(child, level + 1))
    return preview
}

async function generate(generatorNames) {
    if (!generatorNames.length) {
        console.error('Provide some generator names.')
        return
    }
    const sw = new Stopwatch()
    const root = await resolve()
    console.log(`Resolved endpoints in ${sw.getAndReset()}`)
    console.log(buildEndpointPreview(root.endpoint))
    for (const name of generatorNames) {
        const generator = generators[name]
        if (generator) {
            await generator(root)
            console.log(`generated ${name} in ${sw.getAndReset()}`)
        } else {
            console.error(`Unknown generator ${name}`)
        }
    }
}

module.exports = generate