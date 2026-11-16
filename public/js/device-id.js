// Identificador aleatório de 22 caracteres para o aparelho no controle remoto.
// Usa getRandomValues, que existe também em HTTP pelo IP da rede:
// crypto.randomUUID só existe em HTTPS/localhost (contexto seguro).
export function newDeviceId(cryptoApi = globalThis.crypto) {
  const bytes = new Uint8Array(11);
  if (cryptoApi?.getRandomValues) cryptoApi.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
