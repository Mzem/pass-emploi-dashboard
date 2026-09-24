import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatPayload } from '../src/formatters/index.js'
import { formatScalingoEvent, isScalingoEvent } from '../src/formatters/scalingo.js'

const REGION = 'osc-secnum-fr1'
const APP_URL = 'https://dashboard.scalingo.com/apps/osc-secnum-fr1/pass-emploi-api-prod'

function scalingo(type: string, type_data: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    id: '6ab51ad44e36a5bc9f62b1c1',
    type,
    user: { id: 'us-1', email: 'malek.zemni@example.org', username: 'malek.zemni' },
    app_id: '619ba619fb0de6000fa586d2',
    app_name: 'pass-emploi-api-prod',
    type_data,
    created_at: '2026-09-24T12:43:00.494Z',
    ...extra
  }
}

describe('isScalingoEvent', () => {
  it('reconnaît un évènement Scalingo', () => {
    assert.equal(isScalingoEvent(scalingo('deployment', {})), true)
  })

  it('ignore les autres payloads', () => {
    assert.equal(isScalingoEvent({ text: 'x' }), false)
    assert.equal(isScalingoEvent({ type: 'deployment' }), false)
    assert.equal(isScalingoEvent('deployment'), false)
    assert.equal(isScalingoEvent(null), false)
  })
})

describe('formatScalingoEvent', () => {
  it('met en forme la modification d’un notifieur (payload réel)', () => {
    const event = scalingo('edit_notifier', {
      active: true,
      notifier_name: 'Dashboard Pass Emploi',
      notifier_type: 'webhook',
      platform_name: 'webhook',
      selected_events: [],
      send_all_events: true,
      notifier_type_data: {
        webhook_url: 'https://pass-emploi-dashboard.osc-secnum-fr1.scalingo.io/hooks/scalingo-prod'
      }
    })
    const result = formatScalingoEvent(event, REGION)
    assert.equal(result.username, 'Scalingo')
    assert.equal(result.text, null)
    const attachment = result.attachments[0]!
    assert.equal(attachment.title, '[pass-emploi-api-prod] Notifieur modifié')
    assert.equal(attachment.titleLink, APP_URL)
    assert.equal(attachment.color, '#2F5BEA')
    assert.equal(attachment.footer, 'Par malek.zemni')
    assert.deepEqual(
      attachment.fields.map(f => [f.title, f.value, f.short]),
      [
        ['Actif', 'oui', true],
        ['Nom du notifieur', 'Dashboard Pass Emploi', true],
        ['Type de notifieur', '`webhook`', true],
        ['Plateforme', '`webhook`', true],
        ['Évènements sélectionnés', '—', true],
        ['Tous les évènements', 'oui', true],
        [
          'Paramètres du notifieur',
          '• URL du webhook : https://pass-emploi-dashboard.osc-secnum-fr1.scalingo.io/hooks/scalingo-prod',
          false
        ]
      ]
    )
  })

  it('met en forme un déploiement réussi avec lien vers le déploiement', () => {
    const event = scalingo('deployment', {
      deployment_id: '5f3b2a',
      pusher: 'malek.zemni',
      git_ref: 'v10.1.3',
      status: 'success',
      duration: 95
    })
    const attachment = formatScalingoEvent(event, REGION).attachments[0]!
    assert.equal(attachment.title, '[pass-emploi-api-prod] Déploiement réussi')
    assert.equal(attachment.titleLink, `${APP_URL}/deploy/5f3b2a`)
    assert.equal(attachment.color, '#2EB886')
    assert.deepEqual(
      attachment.fields.map(f => [f.title, f.value]),
      [
        ['Auteur du push', '`malek.zemni`'],
        ['Référence git', '`v10.1.3`'],
        ['Durée', '1 min 35 s']
      ]
    )
  })

  it('signale un déploiement en échec', () => {
    const event = scalingo('deployment', { status: 'build-error', pusher: 'x' })
    const attachment = formatScalingoEvent(event, REGION).attachments[0]!
    assert.equal(attachment.title, '[pass-emploi-api-prod] Échec du build')
    assert.equal(attachment.color, '#A30200')
  })

  it('affiche les logs d’un crash en bloc de code', () => {
    const event = scalingo('crash', {
      container_type: 'web',
      crash_logs: 'Error: boom\n    at main (dist/main.js:1:1)'
    })
    const attachment = formatScalingoEvent(event, REGION).attachments[0]!
    assert.equal(attachment.title, '[pass-emploi-api-prod] Crash du conteneur web')
    assert.equal(attachment.text, '```\nError: boom\n    at main (dist/main.js:1:1)\n```')
    assert.deepEqual(attachment.fields.map(f => f.title), ['Conteneur'])
  })

  it('résume un scaling avant → après', () => {
    const event = scalingo('scale', {
      containers: [
        { name: 'web', amount: 2, size: 'M' },
        { name: 'worker', amount: 1, size: 'S' }
      ],
      previous_containers: [{ name: 'web', amount: 1, size: 'M' }]
    })
    const attachment = formatScalingoEvent(event, REGION).attachments[0]!
    assert.deepEqual(
      attachment.fields.map(f => [f.title, f.value]),
      [
        ['web', '1 × M → 2 × M'],
        ['worker', '1 × S']
      ]
    )
  })

  it('distingue une alerte déclenchée d’une alerte terminée', () => {
    const triggered = formatScalingoEvent(
      scalingo('alert', { container_type: 'web', metric: 'cpu', limit: 0.8, value: 0.93, activated: true }),
      REGION
    ).attachments[0]!
    assert.equal(triggered.title, '[pass-emploi-api-prod] Alerte cpu sur web déclenchée')
    assert.equal(triggered.color, '#A30200')

    const resolved = formatScalingoEvent(
      scalingo('alert', { container_type: 'web', metric: 'cpu', limit: 0.8, value: 0.4, activated: false }),
      REGION
    ).attachments[0]!
    assert.equal(resolved.title, '[pass-emploi-api-prod] Alerte cpu sur web terminée')
    assert.equal(resolved.color, '#2EB886')
  })

  it('humanise un type inconnu et un évènement sans app', () => {
    const event = { id: 'x', type: 'some_new_thing', type_data: { foo_bar: 'baz' } }
    const attachment = formatScalingoEvent(event, REGION).attachments[0]!
    assert.equal(attachment.title, 'Some new thing')
    assert.equal(attachment.titleLink, null)
    assert.equal(attachment.footer, null)
    assert.deepEqual(attachment.fields.map(f => [f.title, f.value]), [['Foo bar', '`baz`']])
  })
})

describe('formatPayload', () => {
  it('renvoie null pour un payload non reconnu', () => {
    assert.equal(formatPayload({ hello: 'world' }, { scalingoRegion: REGION }), null)
    assert.equal(formatPayload('texte', { scalingoRegion: REGION }), null)
  })

  it('délègue au formateur Scalingo', () => {
    const result = formatPayload(scalingo('restart', { scope: ['web'] }), { scalingoRegion: REGION })
    assert.equal(result?.attachments[0]?.title, '[pass-emploi-api-prod] Redémarrage')
    assert.deepEqual(result?.attachments[0]?.fields, [{ title: 'Périmètre', value: '`web`', short: true }])
  })
})
