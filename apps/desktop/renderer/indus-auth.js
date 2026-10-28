/** Native sign-in presentation; this document has no network or credential access. */
const identity = window.indusIdentity
const start = document.getElementById('start')
const cancel = document.getElementById('cancel')
const status = document.getElementById('status')
let copy
function render(state) {
  status.textContent = copy[state]
  start.disabled = state === 'unconfigured' || state === 'waiting' || state === 'signed-in'
  cancel.hidden = state !== 'waiting'
}
identity.read().then((view) => {
  copy = view.copy
  document.title = copy.title
  for (const element of document.querySelectorAll('[data-copy]')) element.textContent = copy[element.dataset.copy]
  render(view.state)
  const dispose = identity.onState(render)
  window.addEventListener('pagehide', dispose, { once: true })
})
start.addEventListener('click', () => { start.disabled = true; identity.start().then(render).catch(() => { render('failed') }) })
cancel.addEventListener('click', () => { identity.cancel().then(render).catch(() => { render('failed') }) })
