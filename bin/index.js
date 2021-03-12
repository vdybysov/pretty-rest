#!/usr/bin/env node

const [, , command, ...rest] = process.argv

const generate = require('./generate.js')

switch (command) {
    case 'generate':
        generate(rest)
        break
    case 'watch':
        const chokidar = require('chokidar')
        console.log('Waiting for changes...')
        let generateTimeout
        chokidar.watch(['./endpoints', './context', './errors']).on('all', (event, path) => {
            console.log(`${path} changed`)
            if(generateTimeout) {
                clearTimeout(generateTimeout)
            }
            generateTimeout = setTimeout(async () => await generate(rest), 100)
        })
        break
    default:
        console.log(`Unknown command '${command}'.`)
}