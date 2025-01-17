import * as Yup from 'yup'
import { startOfHour, parseISO, isBefore, format, subHours } from 'date-fns'
import pt from 'date-fns/locale/pt'
import Appointment from '../models/Appointment'
import User from '../models/User'
import File from '../models/File'
import Notification from '../schemas/Notification'
import CancellationMail from '../jobs/CancellationMail'
import Queue from '../../lib/Queue'

class AppointmentController {
  async index (req, res) {
    const { page = 1 } = req.query

    const appointments = await Appointment.findAll({
      where: { user_id: req.userId, canceled_at: null },
      order: ['date'],
      limit: 20,
      offset: (page - 1) * 20,
      attributes: ['id', 'date', 'past', 'cancellable'],
      include: [
        {
          model: User,
          as: 'provider',
          attributes: ['id', 'name'],
          include: [
            {
              model: File,
              as: 'avatar',
              attributes: ['id', 'path', 'url']
            }
          ]
        }
      ]
    })

    return res.json(appointments)
  }

  async store (req, res) {
    const schema = Yup.object().shape({
      provider_id: Yup.number().required(),
      date: Yup.date().required()
    })

    if (!(await schema.isValid(req.body))) {
      return res.status(400).json({ error: 'Validation fails' })
    }

    const { provider_id, date } = req.body

    /**
     * Verifica se o provider está agendando um horário para ele mesmo.
     */
    if (provider_id === req.userId) {
      return res
        .status(401)
        .json({ error: 'Você não pode criar agendamentos para si mesmo.' })
    }

    /**
     * Verifica se provider_id é um provider
     */
    const checkIsProvider = await User.findOne({
      where: { id: provider_id, provider: true }
    })

    if (!checkIsProvider) {
      return res
        .status(401)
        .json({ error: 'É necessário um provider para criar agendamentos.' })
    }

    /**
     * Verificando se a data informada é anterior à atual
     */
    const hourStart = startOfHour(parseISO(date))
    if (isBefore(hourStart, new Date())) {
      return res
        .status(400)
        .json({ error: 'A data informada é anterior à data atual.' })
    }

    /**
     * Verificando disponibilidade da data informada
     */
    const checkAvailability = await Appointment.findOne({
      where: {
        provider_id,
        canceled_at: null,
        date: hourStart
      }
    })

    if (checkAvailability) {
      return res
        .status(400)
        .json({ error: 'A data e horário informados não estão disponíveis.' })
    }

    /**
     * Criando Agendamento
     */

    const appointment = await Appointment.create({
      user_id: req.userId,
      provider_id,
      date
    })

    /**
     * Notificar prestador de serviços
     */
    const user = await User.findByPk(req.userId)

    const formattedDate = format(hourStart, "dd 'de' MMMM', às' H'h'mm", {
      locale: pt
    })

    await Notification.create({
      content: `Novo agendamento de ${user.name} para o dia ${formattedDate}`,
      user: provider_id
    })

    return res.json(appointment)
  }

  async delete (req, res) {
    const appointment = await Appointment.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: 'provider',
          attributes: ['name', 'email']
        },
        {
          model: User,
          as: 'user',
          attributes: ['name']
        }
      ]
    })

    if (appointment.user_id !== req.userId) {
      return res.status(401).json({
        error: 'Você não tem permissão para cancelar este agendamento.'
      })
    }

    const dateWithSub = subHours(appointment.date, 2)

    if (isBefore(dateWithSub, new Date())) {
      return res.status(401).json({
        error: 'Cancelamento só é permitido até 2 horas antes do agendamento.'
      })
    }

    appointment.canceled_at = new Date()

    await appointment.save()

    await Queue.add(CancellationMail.key, {
      appointment
    })

    return res.json(appointment)
  }
}

export default new AppointmentController()
