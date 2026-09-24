import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseWebhookBody, toNewMessage } from '../src/webhook.js'

const target = { category: 'jobs', env: 'prod' } as const

describe('parseWebhookBody', () => {
  it('lit un corps JSON', () => {
    const payload = parseWebhookBody('application/json; charset=utf-8', '{"text":"salut"}')
    assert.deepEqual(payload, { text: 'salut' })
  })

  it('lit un formulaire avec un champ payload (format Mattermost / Slack)', () => {
    const body = new URLSearchParams({ payload: '{"text":"depuis un form"}' }).toString()
    const payload = parseWebhookBody('application/x-www-form-urlencoded', body)
    assert.deepEqual(payload, { text: 'depuis un form' })
  })

  it('lit un formulaire sans payload comme un objet clé/valeur', () => {
    const payload = parseWebhookBody('application/x-www-form-urlencoded', 'text=a&username=b')
    assert.deepEqual(payload, { text: 'a', username: 'b' })
  })

  it('accepte du JSON sans Content-Type', () => {
    assert.deepEqual(parseWebhookBody(undefined, '{"text":"x"}'), { text: 'x' })
  })

  it('transforme du texte non JSON en message texte', () => {
    assert.deepEqual(parseWebhookBody('text/plain', 'juste du texte'), {
      text: 'juste du texte'
    })
  })

  it('renvoie un objet vide pour un corps vide', () => {
    assert.deepEqual(parseWebhookBody('application/json', '   '), {})
  })

  it('retire les caractères nuls (refusés par Postgres jsonb)', () => {
    assert.deepEqual(parseWebhookBody('application/json', '{"text":"a\u0000b"}'), {
      text: 'ab'
    })
  })
})

describe('toNewMessage', () => {
  it('extrait les champs Mattermost du message de pass-emploi-api', () => {
    const payload = { username: 'CEJ Lama', text: '### Résultat du job' }
    const message = toNewMessage(target, payload, '2026-09-24T10:00:00.000Z')
    assert.equal(message.category, 'jobs')
    assert.equal(message.env, 'prod')
    assert.equal(message.username, 'CEJ Lama')
    assert.equal(message.text, '### Résultat du job')
    assert.equal(message.receivedAt, '2026-09-24T10:00:00.000Z')
    assert.deepEqual(message.attachments, [])
    assert.deepEqual(message.raw, payload)
  })

  it('normalise les attachments (format alerte CVE)', () => {
    const message = toNewMessage(target, {
      text: '@here :rotating_light: **2 CVE(s)**',
      attachments: [
        {
          color: '#FF0000',
          text: '• **CVE-1** - lib (high)',
          fields: [{ title: 'Repo', value: 'pass-emploi-api', short: true }]
        },
        { color: 'danger', title: 'Titre', title_link: 'https://github.com' },
        'pas un objet'
      ]
    })
    assert.equal(message.attachments.length, 2)
    assert.equal(message.attachments[0]!.color, '#FF0000')
    assert.equal(message.attachments[0]!.text, '• **CVE-1** - lib (high)')
    assert.deepEqual(message.attachments[0]!.fields, [
      { title: 'Repo', value: 'pass-emploi-api', short: true }
    ])
    assert.equal(message.attachments[1]!.color, '#A30200')
    assert.equal(message.attachments[1]!.titleLink, 'https://github.com/')
  })

  it('ignore les URLs non http(s)', () => {
    const message = toNewMessage(target, {
      text: 'x',
      icon_url: 'javascript:alert(1)',
      attachments: [{ title_link: 'ftp://x' }]
    })
    assert.equal(message.iconUrl, null)
    assert.equal(message.attachments[0]!.titleLink, null)
  })

  it('garde le payload brut quand aucun champ connu n’est présent', () => {
    const payload = { app_name: 'api', type: 'deployment' }
    const message = toNewMessage(target, payload)
    assert.equal(message.text, null)
    assert.deepEqual(message.attachments, [])
    assert.deepEqual(message.raw, payload)
  })

  it('accepte une chaîne brute comme texte', () => {
    assert.equal(toNewMessage(target, 'bonjour').text, 'bonjour')
  })

  it('tronque les textes trop longs', () => {
    const message = toNewMessage(target, { text: 'a'.repeat(200_000) })
    assert.equal(message.text!.length, 100_001)
  })
})
