import { api, getSession } from './common.js';
import { passwordProblem } from './password-rules.js';

const form = document.getElementById('setup-form');
const error = document.getElementById('error');

const session = await getSession();
if (session.configured) location.replace(session.authenticated ? '/' : '/login');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = form.password.value;
  const confirm = form.confirm.value;
  const problem = passwordProblem(password, confirm);
  error.textContent = problem;
  if (problem) {
    (password.length < 8 ? form.password : form.confirm).focus();
    return;
  }
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    await api('/setup', { method: 'POST', body: { password, confirm } });
    location.replace('/');
  } catch (err) {
    if (err.status === 409) location.replace('/login');
    else error.textContent = err.message;
  } finally {
    button.disabled = false;
  }
});
