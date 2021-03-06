const path = require('path')
const { resolveEntry, fileToComponentName } = require('./resolveWcEntry')

module.exports = (api, { target, entry, name }) => {
  // setting this disables app-only configs
  process.env.VUE_CLI_TARGET = 'web-component'
  // Disable CSS extraction and turn on CSS shadow mode for vue-style-loader
  process.env.VUE_CLI_CSS_SHADOW_MODE = true

  const { log, error } = require('@vue/cli-shared-utils')
  const abort = msg => {
    log()
    error(msg)
    process.exit(1)
  }

  const isAsync = /async/.test(target)

  // generate dynamic entry based on glob files
  const resolvedFiles = require('globby').sync([entry], { cwd: api.resolve('.') })
  if (!resolvedFiles.length) {
    abort(`entry pattern "${entry}" did not match any files.`)
  }
  let libName
  let prefix
  if (resolvedFiles.length === 1) {
    // in single mode, determine the lib name from filename
    libName = name || fileToComponentName('', resolvedFiles[0]).kebabName
    prefix = ''
    if (libName.indexOf('-') < 0) {
      abort(`--name must contain a hyphen when building a single web component.`)
    }
  } else {
    // multi mode
    libName = prefix = (name || api.service.pkg.name)
    if (!libName) {
      abort(`--name is required when building multiple web components.`)
    }
  }

  const dynamicEntry = resolveEntry(prefix, resolvedFiles, isAsync)

  function genConfig (minify, genHTML) {
    const config = api.resolveChainableWebpackConfig()

    config.entryPoints.clear()
    const entryName = `${libName}${minify ? `.min` : ``}`

    // set proxy entry for *.vue files
    config
      .entry(entryName)
        .add(dynamicEntry)
    config.resolve
      .alias
        .set('~root', api.resolve('.'))

    // make sure not to transpile wc-wrapper
    config.module
      .rule('js')
        .exclude
          .add(/vue-wc-wrapper/)

    // only minify min entry
    if (!minify) {
      config.plugins.delete('uglify')
    }

    config.output
      .filename(`${entryName}.js`)
      .chunkFilename(`${libName}.[id]${minify ? `.min` : ``}.js`)
      // use relative publicPath so this can be deployed anywhere
      .publicPath('./')

    // externalize Vue in case user imports it
    config
      .externals({
        vue: 'Vue'
      })

    config
      .plugin('web-component-options')
        .use(require('webpack/lib/DefinePlugin'), [{
          'process.env': {
            CUSTOM_ELEMENT_NAME: JSON.stringify(libName)
          }
        }])

    // enable shadow mode in vue-loader
    config.module
      .rule('vue')
        .use('vue-loader')
          .tap(options => {
            options.shadowMode = true
            return options
          })

    if (genHTML) {
      config
        .plugin('demo-html')
          .use(require('html-webpack-plugin'), [{
            template: path.resolve(__dirname, `./demo-wc.html`),
            inject: false,
            filename: 'demo.html',
            libName,
            components: resolvedFiles.map(file => {
              return fileToComponentName(prefix, file).kebabName
            })
          }])
    }

    return api.resolveWebpackConfig(config)
  }

  return [
    genConfig(false, true),
    genConfig(true, false)
  ]
}
