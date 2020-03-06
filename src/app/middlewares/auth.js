import jwt from 'jsonwebtoken'
import { promisify } from 'util'
import authConfig from '../../config/auth'

/**
 * Middleware de autenticação. Verifica se o usuário está corretamente autenticado.
 */

export default async (req, res, next) => {
  const authHeader = req.headers.authorization

  // Verificando se o token foi enviado no cabeçalho da requisição.
  if (!authHeader) {
    return res.status(401).json({ error: 'Token Não Enviado!' })
  }

  const [, token] = authHeader.split(' ')

  // Caso tenha sido enviado será verificado se não foi alterado.
  try {
    const decoded = await promisify(jwt.verify)(token, authConfig.secret)
    req.userId = decoded.id
    return next()
  } catch (err) {
    return res.status(401).json({ error: 'Token Inválido!' })
  }
}
