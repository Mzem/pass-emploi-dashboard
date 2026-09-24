import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  normalizeMattermostMarkdown,
  presentMessage,
  renderEmoji,
  renderMarkdown
} from '../src/render.js'
import type { Message } from '../src/store/types.js'

/** Message tel que construit par SuiviJobService dans pass-emploi-api (lignes indentées). */
const MESSAGE_JOB = `### Résultat du job _NETTOYER_LES_DONNEES_
| Statut | :white_check_mark: |
    |:------------------------|:------------|
    | jobType | NETTOYER_LES_DONNEES |
    | dateExecution | 2026-09-24T03:00:00.000+02:00 |
    | succes | true |`

describe('renderMarkdown', () => {
  it('rend un tableau markdown indenté comme Mattermost', () => {
    const html = renderMarkdown(MESSAGE_JOB)
    assert.match(html, /<h3>Résultat du job <em>NETTOYER_LES_DONNEES<\/em><\/h3>/)
    assert.match(html, /<table>/)
    assert.match(html, /<th align="left">Statut<\/th>/)
    assert.match(html, /<td align="left">NETTOYER_LES_DONNEES<\/td>/)
    assert.doesNotMatch(html, /<pre>/)
  })

  it('convertit les shortcodes emoji', () => {
    assert.match(renderMarkdown('ok :white_check_mark: ko :x:'), /✅.*❌/)
  })

  it('rend le rapport quotidien des CRONs', () => {
    const rapport =
      '### Rapport quotidien des CRONs\n|aBienTourne|pasEnEchec|jobType\n|:---|:---|:---\n|:white_check_mark:|:x:|JOB_A|'
    const html = renderMarkdown(rapport)
    assert.match(html, /<table>/)
    assert.match(html, /<th align="left">aBienTourne<\/th>/)
    assert.match(html, /JOB_A/)
  })

  it('assainit le HTML dangereux', () => {
    const html = renderMarkdown(
      '<script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">x</a> [lien](javascript:alert(2))'
    )
    assert.doesNotMatch(html, /<script/)
    assert.doesNotMatch(html, /onerror/)
    assert.doesNotMatch(html, /href="javascript:/)
  })

  it('ouvre les liens dans un nouvel onglet', () => {
    const html = renderMarkdown('[Voir](https://github.com/France-Travail/pass-emploi-api/security/dependabot)')
    assert.match(html, /<a href="https:\/\/github\.com\/[^"]+" target="_blank" rel="noopener noreferrer">Voir<\/a>/)
  })

  it('rend les blocs de code (stack traces)', () => {
    const html = renderMarkdown('```\nError: boom\n    at foo (bar.ts:1:1)\n```')
    assert.match(html, /<pre><code>Error: boom\n {4}at foo \(bar\.ts:1:1\)\n<\/code><\/pre>/)
  })

  it('respecte les retours à la ligne simples', () => {
    assert.match(renderMarkdown('ligne 1\nligne 2'), /ligne 1<br \/>ligne 2/)
  })
})

describe('normalizeMattermostMarkdown', () => {
  it('ne retire l’indentation que devant un pipe', () => {
    assert.equal(normalizeMattermostMarkdown('    | a |\n    code'), '| a |\n    code')
  })
})

describe('renderEmoji', () => {
  it('rend un shortcode connu', () => {
    assert.equal(renderEmoji(':robot:'), '🤖')
  })

  it('renvoie null pour un shortcode inconnu ou vide', () => {
    assert.equal(renderEmoji(':pas_un_emoji:'), null)
    assert.equal(renderEmoji(null), null)
  })
})

describe('presentMessage', () => {
  it('rend le texte et les attachments (alerte CVE)', () => {
    const message: Message = {
      id: 1,
      category: 'cve',
      env: 'prod',
      receivedAt: '2026-09-24T10:00:00.000Z',
      username: null,
      iconUrl: null,
      iconEmoji: ':rotating_light:',
      text: '@here :rotating_light: **2 CVE(s) high/critical sur pass-emploi-api**',
      attachments: [
        {
          fallback: null,
          color: '#FF0000',
          pretext: null,
          authorName: null,
          authorLink: null,
          authorIcon: null,
          title: 'Dependabot',
          titleLink: 'https://github.com/',
          text: '• **CVE-2026-1** - lodash (high): prototype pollution - [Voir](https://github.com/x)',
          fields: [{ title: 'Repo', value: '`pass-emploi-api`', short: true }],
          imageUrl: null,
          thumbUrl: null,
          footer: 'GitHub'
        }
      ],
      raw: { text: 'x' }
    }
    const presented = presentMessage(message)
    assert.equal(presented.iconEmoji, '🚨')
    assert.match(presented.html!, /🚨 <strong>2 CVE\(s\) high\/critical sur pass-emploi-api<\/strong>/)
    const attachment = presented.attachments[0]!
    assert.equal(attachment.color, '#FF0000')
    assert.equal(attachment.titleHtml, 'Dependabot')
    assert.match(attachment.textHtml!, /<strong>CVE-2026-1<\/strong>/)
    assert.match(attachment.textHtml!, /<a href="https:\/\/github\.com\/x" target="_blank"/)
    assert.match(attachment.fields[0]!.valueHtml!, /<code>pass-emploi-api<\/code>/)
    assert.equal(attachment.footer, 'GitHub')
    assert.deepEqual(presented.raw, { text: 'x' })
  })
})
