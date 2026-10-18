import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Secret, TOTP, URI } from 'otpauth';
import { base32Decode, base32Encode, hotp, newTotpSecret, otpauthUri, stepAt, totp, verifyTotp } from '../src/totp.ts';

// The secret both RFCs use for their test values: the ASCII bytes of "12345678901234567890".
const RFC_SECRET = Buffer.from('12345678901234567890');
const NOW = Date.parse('2026-10-17T12:00:00Z');
const codeAt = (steps: number) => totp(RFC_SECRET, NOW + steps * 30_000);

test('HOTP matches the RFC 4226 test values', () => {
  const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
  expected.forEach((code, counter) => assert.equal(hotp(RFC_SECRET, counter), code));
});

test('TOTP matches the RFC 6238 test values (SHA-1, 8 digits)', () => {
  const vectors: [number, string][] = [
    [59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'],
    [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130'],
  ];
  for (const [seconds, code] of vectors) assert.equal(totp(RFC_SECRET, seconds * 1000, 8), code);
});

test('base32 matches the RFC 4648 test values, without padding', () => {
  const vectors = [['f', 'MY'], ['fo', 'MZXQ'], ['foo', 'MZXW6'], ['foob', 'MZXW6YQ'], ['fooba', 'MZXW6YTB'], ['foobar', 'MZXW6YTBOI']];
  for (const [text, encoded] of vectors) {
    assert.equal(base32Encode(Buffer.from(text)), encoded);
    assert.equal(base32Decode(encoded).toString(), text);
  }
});

test('the codes match the otpauth library for random secrets and times', () => {
  for (let i = 0; i < 200; i++) {
    const secret = newTotpSecret();
    const ms = Math.floor(Math.random() * 4_102_444_800_000); // any time before 2100
    const library = TOTP.generate({ secret: Secret.fromBase32(base32Encode(secret)), timestamp: ms });
    assert.equal(totp(secret, ms), library);
  }
});

test('a code is accepted one step early or late, but not two', () => {
  const now = stepAt(NOW);
  assert.equal(verifyTotp(RFC_SECRET, codeAt(0), NOW), now);
  assert.equal(verifyTotp(RFC_SECRET, codeAt(-1), NOW), now - 1);
  assert.equal(verifyTotp(RFC_SECRET, codeAt(1), NOW), now + 1);
  assert.equal(verifyTotp(RFC_SECRET, codeAt(-2), NOW), null);
  assert.equal(verifyTotp(RFC_SECRET, codeAt(2), NOW), null);
  assert.equal(verifyTotp(RFC_SECRET, 'abcdef', NOW), null);
});

test('a step at or before the last one used is refused, so a code works once', () => {
  const used = verifyTotp(RFC_SECRET, codeAt(0), NOW)!;
  assert.equal(verifyTotp(RFC_SECRET, codeAt(0), NOW, used), null); // the same code again
  assert.equal(verifyTotp(RFC_SECRET, codeAt(-1), NOW, used), null); // an older one
  assert.equal(verifyTotp(RFC_SECRET, codeAt(1), NOW, used), used + 1); // the next one is fine
});

test('a new secret is 160 random bits, and the otpauth URI carries it in a form the library reads', () => {
  const secret = newTotpSecret();
  assert.equal(secret.length, 20);
  assert.notDeepEqual(secret, newTotpSecret());
  const b32 = base32Encode(RFC_SECRET);
  const uri = otpauthUri(b32, 'ada@example.com', 'Auth Lab');
  assert.equal(uri, 'otpauth://totp/Auth%20Lab:ada%40example.com?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Auth%20Lab&algorithm=SHA1&digits=6&period=30');
  const parsed = URI.parse(uri) as TOTP;
  assert.deepEqual(
    [parsed.issuer, parsed.label, parsed.secret.base32, parsed.algorithm, parsed.digits, parsed.period],
    ['Auth Lab', 'ada@example.com', b32, 'SHA1', 6, 30],
  );
});
