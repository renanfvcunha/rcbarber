import 'dotenv/config'
import express, { json } from 'express'
import path from 'path'
import cors from 'cors'
import Youch from 'youch'
import * as Sentry from '@sentry/node'
import 'express-async-errors'

import routes from './routes'
import sentryConfig from './config/sentry'

import './database'

/**
 * Classe App, onde serão definidas todas as configurações da aplicação.
 * No construtor são chamados os middlewares (app/middlewares) e as rotas (routes.js).
 */
class App {
  constructor () {
    this.server = express()

    Sentry.init(sentryConfig)

    this.middlewares()
    this.routes()
    this.exceptionHandler()
  }

  /* webApp() {
    this.server.use(express.static(path.join(__dirname, 'build')));
    this.server.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'build', 'index.html'));
    });
  } */

  middlewares () {
    this.server.use(Sentry.Handlers.requestHandler())
    this.server.use(cors())
    this.server.use(json())
    this.server.use(
      '/files',
      express.static(path.resolve(__dirname, '..', 'tmp', 'uploads'))
    )
  }

  routes () {
    this.server.use(routes)
    this.server.use(Sentry.Handlers.errorHandler())
  }

  exceptionHandler () {
    this.server.use(async (err, req, res, next) => {
      if (process.env.NODE_ENV === 'development') {
        const errors = await new Youch(err, req).toJSON()

        return res.status(500).json(errors)
      }
      return res.status(500).json({ error: 'Erro Interno do Servidor' })
    })
  }
}

export default new App().server
