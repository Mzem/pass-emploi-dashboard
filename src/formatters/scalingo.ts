import type { Attachment, AttachmentField } from '../store/types.js'
import type { FormattedPayload } from './types.js'

/**
 * Mise en forme des évènements envoyés par un notifieur Scalingo de type « webhook »
 * (https://developers.scalingo.com/events), qui poste l'objet event brut.
 */

export interface ScalingoEvent {
  id: string
  type: string
  app_name?: string
  user?: { username?: string; email?: string }
  type_data?: Record<string, unknown>
}

const DASHBOARD_URL = 'https://dashboard.scalingo.com/apps'
const USERNAME = 'Scalingo'
const MAX_FIELD_LENGTH = 2000

type Color = 'good' | 'warning' | 'danger' | 'info'

const COLORS: Record<Color, string> = {
  good: '#2EB886',
  warning: '#DAA038',
  danger: '#A30200',
  info: '#2F5BEA'
}

interface EventSpec {
  label: string
  color: Color
}

const EVENT_SPECS: Record<string, EventSpec> = {
  deployment: { label: 'Déploiement', color: 'info' },
  crash: { label: 'Crash de conteneur', color: 'danger' },
  repeated_crash: { label: 'Crashs répétés', color: 'danger' },
  restart: { label: 'Redémarrage', color: 'warning' },
  stop_app: { label: 'Application arrêtée', color: 'danger' },
  start_app: { label: 'Application démarrée', color: 'good' },
  scale: { label: 'Changement du nombre de conteneurs', color: 'info' },
  alert: { label: 'Alerte de métrique', color: 'danger' },
  new_alert: { label: 'Alerte créée', color: 'info' },
  edit_alert: { label: 'Alerte modifiée', color: 'info' },
  delete_alert: { label: 'Alerte supprimée', color: 'warning' },
  run: { label: 'Commande one-off', color: 'info' },
  new_app: { label: 'Application créée', color: 'good' },
  edit_app: { label: 'Application modifiée', color: 'info' },
  rename_app: { label: 'Application renommée', color: 'warning' },
  transfer_app: { label: 'Application transférée', color: 'warning' },
  delete_app: { label: 'Application supprimée', color: 'danger' },
  stack_changed: { label: 'Stack modifiée', color: 'warning' },
  new_addon: { label: 'Addon ajouté', color: 'good' },
  upgrade_addon: { label: 'Addon mis à niveau', color: 'info' },
  delete_addon: { label: 'Addon supprimé', color: 'danger' },
  resume_addon: { label: 'Addon réactivé', color: 'good' },
  suspend_addon: { label: 'Addon suspendu', color: 'danger' },
  upgrade_database: { label: 'Base de données mise à niveau', color: 'info' },
  database_add_feature: { label: 'Fonctionnalité de base activée', color: 'info' },
  database_remove_feature: { label: 'Fonctionnalité de base désactivée', color: 'warning' },
  new_collaborator: { label: 'Collaborateur invité', color: 'info' },
  accept_collaborator: { label: 'Collaborateur ajouté', color: 'info' },
  delete_collaborator: { label: 'Collaborateur retiré', color: 'warning' },
  new_domain: { label: 'Domaine ajouté', color: 'info' },
  edit_domain: { label: 'Domaine modifié', color: 'info' },
  delete_domain: { label: 'Domaine supprimé', color: 'warning' },
  new_notifier: { label: 'Notifieur créé', color: 'info' },
  edit_notifier: { label: 'Notifieur modifié', color: 'info' },
  delete_notifier: { label: 'Notifieur supprimé', color: 'warning' },
  new_variable: { label: 'Variable d’environnement ajoutée', color: 'info' },
  edit_variable: { label: 'Variable d’environnement modifiée', color: 'info' },
  edit_variables: { label: 'Variables d’environnement modifiées', color: 'info' },
  delete_variable: { label: 'Variable d’environnement supprimée', color: 'warning' },
  new_autoscaler: { label: 'Autoscaler créé', color: 'info' },
  edit_autoscaler: { label: 'Autoscaler modifié', color: 'info' },
  delete_autoscaler: { label: 'Autoscaler supprimé', color: 'warning' },
  link_scm: { label: 'Dépôt SCM lié', color: 'info' },
  unlink_scm: { label: 'Dépôt SCM délié', color: 'warning' },
  link_github: { label: 'Dépôt GitHub lié', color: 'info' },
  unlink_github: { label: 'Dépôt GitHub délié', color: 'warning' },
  new_log_drain: { label: 'Log drain ajouté', color: 'info' },
  delete_log_drain: { label: 'Log drain supprimé', color: 'warning' },
  new_addon_log_drain: { label: 'Log drain d’addon ajouté', color: 'info' },
  delete_addon_log_drain: { label: 'Log drain d’addon supprimé', color: 'warning' },
  new_review_app: { label: 'Review app créée', color: 'info' },
  destroy_review_app: { label: 'Review app détruite', color: 'info' },
  new_key: { label: 'Clé SSH ajoutée', color: 'info' },
  delete_key: { label: 'Clé SSH supprimée', color: 'warning' },
  new_user: { label: 'Utilisateur créé', color: 'info' },
  authorize_github: { label: 'Compte GitHub autorisé', color: 'info' },
  revoke_github: { label: 'Compte GitHub révoqué', color: 'warning' }
}

const DEPLOYMENT_STATUS: Record<string, EventSpec> = {
  success: { label: 'Déploiement réussi', color: 'good' },
  queued: { label: 'Déploiement en attente', color: 'info' },
  building: { label: 'Build en cours', color: 'info' },
  pushing: { label: 'Envoi de l’image en cours', color: 'info' },
  starting: { label: 'Démarrage en cours', color: 'info' },
  'build-error': { label: 'Échec du build', color: 'danger' },
  'timeout-error': { label: 'Déploiement expiré (timeout)', color: 'danger' },
  'crashed-error': { label: 'Déploiement en échec : l’application a crashé', color: 'danger' },
  'hook-error': { label: 'Échec du hook de déploiement', color: 'danger' },
  aborted: { label: 'Déploiement annulé', color: 'warning' }
}

const FIELD_LABELS: Record<string, string> = {
  pusher: 'Auteur du push',
  git_ref: 'Référence git',
  status: 'Statut',
  duration: 'Durée',
  deployment_id: 'Déploiement',
  container_type: 'Conteneur',
  containers: 'Conteneurs',
  previous_containers: 'Conteneurs précédents',
  metric: 'Métrique',
  limit: 'Seuil',
  value: 'Valeur',
  activated: 'Déclenchée',
  send_when_below: 'Alerte si en dessous du seuil',
  duration_before_trigger: 'Délai avant déclenchement',
  remind_every: 'Rappel',
  scope: 'Périmètre',
  addon_name: 'Addon',
  addon_provider_name: 'Fournisseur',
  plan_name: 'Plan',
  old_plan_name: 'Ancien plan',
  command: 'Commande',
  container_size: 'Taille du conteneur',
  detached: 'Détaché',
  audit_log_id: 'Journal d’audit',
  name: 'Nom',
  old_name: 'Ancien nom',
  new_name: 'Nouveau nom',
  email: 'Email',
  collaborator: 'Collaborateur',
  domain: 'Domaine',
  notifier_name: 'Nom du notifieur',
  notifier_type: 'Type de notifieur',
  platform_name: 'Plateforme',
  active: 'Actif',
  send_all_events: 'Tous les évènements',
  selected_events: 'Évènements sélectionnés',
  notifier_type_data: 'Paramètres du notifieur',
  webhook_url: 'URL du webhook',
  crash_logs: 'Logs',
  stack: 'Stack',
  old_stack: 'Ancienne stack',
  new_stack: 'Nouvelle stack',
  region: 'Région',
  repo_name: 'Dépôt',
  source: 'Source',
  url: 'URL',
  min_containers: 'Conteneurs min',
  max_containers: 'Conteneurs max',
  target: 'Cible',
  feature: 'Fonctionnalité',
  version: 'Version',
  old_version: 'Ancienne version',
  new_version: 'Nouvelle version'
}

const HIDDEN_FIELDS = new Set(['crash_logs', 'deployment_id'])

export function isScalingoEvent(raw: unknown): raw is ScalingoEvent {
  return (
    isObject(raw) &&
    typeof raw.type === 'string' &&
    typeof raw.id === 'string' &&
    (typeof raw.app_name === 'string' || isObject(raw.type_data))
  )
}

export function formatScalingoEvent(
  event: ScalingoEvent,
  region: string
): FormattedPayload {
  const data = isObject(event.type_data) ? event.type_data : {}
  const spec = describe(event, data)
  const appUrl = event.app_name
    ? `${DASHBOARD_URL}/${encodeURIComponent(region)}/${encodeURIComponent(event.app_name)}`
    : null

  const attachment: Attachment = {
    fallback: null,
    color: COLORS[spec.color],
    pretext: null,
    authorName: null,
    authorLink: null,
    authorIcon: null,
    title: event.app_name ? `[${event.app_name}] ${spec.label}` : spec.label,
    titleLink: titleLink(event, data, appUrl),
    text: crashLogs(data),
    fields: fields(event, data),
    imageUrl: null,
    thumbUrl: null,
    footer: footer(event)
  }

  return { username: USERNAME, iconEmoji: null, text: null, attachments: [attachment] }
}

function describe(event: ScalingoEvent, data: Record<string, unknown>): EventSpec {
  if (event.type === 'deployment' && typeof data.status === 'string') {
    return DEPLOYMENT_STATUS[data.status] ?? {
      label: `Déploiement (${data.status})`,
      color: 'info'
    }
  }
  if (event.type === 'alert') {
    const metric = typeof data.metric === 'string' ? data.metric : 'métrique'
    const container = typeof data.container_type === 'string' ? ` sur ${data.container_type}` : ''
    return data.activated === false
      ? { label: `Alerte ${metric}${container} terminée`, color: 'good' }
      : { label: `Alerte ${metric}${container} déclenchée`, color: 'danger' }
  }
  if (event.type === 'crash' && typeof data.container_type === 'string') {
    return { label: `Crash du conteneur ${data.container_type}`, color: 'danger' }
  }
  return EVENT_SPECS[event.type] ?? { label: humanize(event.type), color: 'info' }
}

function titleLink(
  event: ScalingoEvent,
  data: Record<string, unknown>,
  appUrl: string | null
): string | null {
  if (!appUrl) return null
  if (event.type === 'deployment' && typeof data.deployment_id === 'string') {
    return `${appUrl}/deploy/${encodeURIComponent(data.deployment_id)}`
  }
  return appUrl
}

function crashLogs(data: Record<string, unknown>): string | null {
  if (typeof data.crash_logs !== 'string' || data.crash_logs.trim() === '') return null
  return '```\n' + data.crash_logs.trim() + '\n```'
}

function footer(event: ScalingoEvent): string | null {
  const user = event.user?.username ?? event.user?.email
  return user ? `Par ${user}` : null
}

function fields(event: ScalingoEvent, data: Record<string, unknown>): AttachmentField[] {
  if (event.type === 'scale') {
    const scaled = scaleFields(data)
    if (scaled) return scaled
  }
  const result: AttachmentField[] = []
  for (const [key, value] of Object.entries(data)) {
    if (HIDDEN_FIELDS.has(key)) continue
    if (event.type === 'deployment' && key === 'status') continue
    result.push({
      title: labelFor(key),
      value: formatValue(key, value),
      short: isShort(value)
    })
  }
  return result
}

interface Container {
  name: string
  amount: number
  size?: string
}

/** Un champ par type de conteneur : « 1 × M → 2 × M ». */
function scaleFields(data: Record<string, unknown>): AttachmentField[] | null {
  const next = containers(data.containers)
  if (!next) return null
  const previous = containers(data.previous_containers) ?? []
  return next.map(container => {
    const before = previous.find(p => p.name === container.name)
    const after = describeContainer(container)
    return {
      title: container.name,
      value: before ? `${describeContainer(before)} → ${after}` : after,
      short: true
    }
  })
}

function containers(value: unknown): Container[] | null {
  if (!Array.isArray(value)) return null
  const result: Container[] = []
  for (const item of value) {
    if (!isObject(item) || typeof item.name !== 'string' || typeof item.amount !== 'number') {
      return null
    }
    result.push({
      name: item.name,
      amount: item.amount,
      size: typeof item.size === 'string' ? item.size : undefined
    })
  }
  return result
}

function describeContainer(container: Container): string {
  return container.size ? `${container.amount} × ${container.size}` : String(container.amount)
}

function labelFor(key: string): string {
  return FIELD_LABELS[key] ?? humanize(key)
}

function humanize(key: string): string {
  const words = key.replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function formatValue(key: string, value: unknown): string {
  if (key === 'duration' && typeof value === 'number') return formatDuration(value)
  return truncate(formatAny(value, 0))
}

function formatAny(value: unknown, depth: number): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'oui' : 'non'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return formatString(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return '—'
    if (value.every(isPrimitive)) return value.map(v => formatAny(v, depth + 1)).join(', ')
    if (depth >= 1) return inlineJson(value)
    return value.map(item => `• ${formatAny(item, depth + 1)}`).join('\n')
  }
  if (isObject(value)) {
    const entries = Object.entries(value)
    if (entries.length === 0) return '—'
    if (depth >= 1) {
      return entries.map(([k, v]) => `${labelFor(k)} : ${formatAny(v, depth + 1)}`).join(', ')
    }
    return entries.map(([k, v]) => `• ${labelFor(k)} : ${formatAny(v, depth + 1)}`).join('\n')
  }
  return String(value)
}

function formatString(value: string): string {
  const trimmed = value.trim()
  if (trimmed === '') return '—'
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  // Identifiants, refs git, noms de conteneurs : en code pour éviter toute interprétation markdown.
  if (!/\s/.test(trimmed) && !trimmed.includes('`')) return `\`${trimmed}\``
  return trimmed
}

function inlineJson(value: unknown): string {
  try {
    return '`' + JSON.stringify(value).replace(/`/g, '') + '`'
  } catch {
    return '—'
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return rest > 0 ? `${minutes} min ${rest} s` : `${minutes} min`
}

function isShort(value: unknown): boolean {
  if (isPrimitive(value)) {
    return typeof value !== 'string' || (value.length <= 40 && !value.includes('\n'))
  }
  if (Array.isArray(value)) return value.length <= 3 && value.every(isPrimitive)
  return false
}

function isPrimitive(value: unknown): boolean {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function truncate(value: string): string {
  return value.length > MAX_FIELD_LENGTH ? `${value.slice(0, MAX_FIELD_LENGTH)}…` : value
}
