import { api, getSession } from './common.js';

const form = document.getElementById('login-form');
const error = document.getElementById('error');

function nextUrl() {
  const next = new URLSearchParams(location.search).get('next');
  // Aceita apenas caminhos locais, para não virar um redirecionamento aberto.
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

const session = await getSession();
if (!session.configured) location.replace('/setup');
else if (session.authenticated) location.replace(nextUrl());

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  error.textContent = '';
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    await api('/login', { method: 'POST', body: { password: form.password.value } });
    location.replace(nextUrl());
  } catch (err) {
    error.textContent = err.message;
    form.password.select();
  } finally {
    button.disabled = false;
  }
});
