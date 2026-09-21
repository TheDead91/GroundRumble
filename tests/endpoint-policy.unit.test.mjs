import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isBlockedIPv4,
  isBlockedIPv6,
  isSpecialUseAddress,
  isSpecialUseHostname
} from '../src/utils/endpoint-policy.js';

test('special-use IPv4 policy covers proxy ranges and public addresses', () => {
  for (const ip of [
    '0.1.2.3', '127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1',
    '169.254.1.1', '100.64.0.1', '192.0.0.1', '192.0.2.1', '198.18.0.1',
    '198.51.100.1', '203.0.113.1', '224.0.0.1', '240.0.0.1', '255.255.255.255'
  ]) assert.equal(isBlockedIPv4(ip), true, ip);
  assert.equal(isBlockedIPv4('not-an-ip'), true);
  assert.equal(isBlockedIPv4('8.8.8.8'), false);
  assert.equal(isSpecialUseAddress('192.0.2.1'), true);
  assert.equal(isSpecialUseAddress('8.8.8.8'), false);
  assert.equal(isSpecialUseAddress('api.example.com'), false);
});

test('special-use IPv6 policy covers local, mapped, compatible, and public addresses', () => {
  for (const ip of ['::', '::1', 'fe80::1', 'fc00::1', 'fd00::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:c0a8:101', '::c0a8:101']) {
    assert.equal(isBlockedIPv6(ip), true, ip);
  }
  assert.equal(isBlockedIPv6('::ffff:8.8.8.8'), false);
  assert.equal(isBlockedIPv6('::808:808'), false);
  for (const ip of ['2001:db8::1', '2001:2::1', '2001:10::1', '3fff::1', '5f00::1', '100::1']) {
    assert.equal(isBlockedIPv6(ip), true, ip);
  }
  assert.equal(isSpecialUseAddress('[::1]'), true);
  assert.equal(isSpecialUseAddress('2001:4860:4860::8888'), false);
});

test('NAT64 and 6to4 embedded-loopback addresses are blocked', () => {
  // NAT64 (64:ff9b::/96) embeds the IPv4 in the low 32 bits.
  for (const ip of ['64:ff9b::7f00:1', '64:ff9b::a00:1', '64:ff9b::c0a8:1', '64:ff9b::8.8.8.8']) {
    assert.equal(isBlockedIPv6(ip), true, ip);
  }
  // 6to4 (2002::/16) embeds the IPv4 in bits 16-47.
  for (const ip of ['2002:7f00:1::', '2002:a00:1::', '2002:c0a8:1::', '2002:808:808::']) {
    assert.equal(isBlockedIPv6(ip), true, ip);
  }
  assert.equal(isBlockedIPv6('2001:4860:4860::8888'), false, 'unrelated public IPv6 stays reachable');
});

test('IPv4 literals with out-of-range octets are treated as blocked (invalid)', () => {
  for (const ip of ['8.8.8.256', '1.2.3.999', '255.255.255.999', '192.168.0.-1']) {
    assert.equal(isBlockedIPv4(ip), true, ip);
  }
  assert.equal(isBlockedIPv4('8.8.8.8'), false);
  assert.equal(isBlockedIPv4('127.0.0.1'), true);
});

test('special-use DNS names are blocked without blocking public providers', () => {
  for (const host of ['localhost', 'printer.local', 'service.internal', 'home.home.arpa', 'bad.invalid', 'qa.test', 'metadata', 'metadata.google.internal', 'intranet']) {
    assert.equal(isSpecialUseHostname(host), true, host);
  }
  assert.equal(isSpecialUseHostname('api.github.com'), false);
  assert.equal(isSpecialUseHostname('example.com'), false);
});
