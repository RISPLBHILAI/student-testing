let jose;
async function getJose() {
  if (!jose) {
    jose = await import('jose');
  }
  return jose;
}

const encryptAndSign = async (payload, config) => {
    const jose = await getJose();
    const { encryptionKey, encryptionKeyId, signingKey, signingKeyId, clientId } = config;

    // Debug: Check all values are present
    // console.log('=== Config Debug ===');
    // console.log('clientId:', clientId);
    // console.log('encryptionKeyId (kid for JWE):', encryptionKeyId);
    // console.log('signingKeyId (kid for JWS):', signingKeyId);
    // console.log('encryptionKey length:', encryptionKey?.length);
    // console.log('signingKey length:', signingKey?.length);
    // console.log('====================');

    if (!encryptionKeyId || !signingKeyId) {
        throw new Error('Missing kid values in config!');
    }

    // Step 1: Encrypt
    const encryptKey = new TextEncoder().encode(encryptionKey);
    const jwe = await new jose.CompactEncrypt(
        new TextEncoder().encode(JSON.stringify(payload))
    )
        .setProtectedHeader({
            alg: 'dir',
            enc: 'A256GCM',
            kid: encryptionKeyId,
            clientid: clientId
        })
        .encrypt(encryptKey);

    // Step 2: Sign
    const signKey = new TextEncoder().encode(signingKey);
    const jws = await new jose.CompactSign(
        new TextEncoder().encode(jwe)
    )
        .setProtectedHeader({
            alg: 'HS256',
            kid: signingKeyId,
            clientid: clientId
        })
        .sign(signKey);

    return jws;
};

const verifyAndDecrypt = async (token, config) => {
    const jose = await getJose();
    const { encryptionKey, signingKey } = config;

    const signKey = new TextEncoder().encode(signingKey);
    const { payload: jweToken } = await jose.compactVerify(token, signKey);

    const encryptKey = new TextEncoder().encode(encryptionKey);
    const { plaintext } = await jose.compactDecrypt(
        new TextDecoder().decode(jweToken),
        encryptKey
    );

    return JSON.parse(new TextDecoder().decode(plaintext));
};

module.exports = {
    encryptAndSign,
    verifyAndDecrypt
};