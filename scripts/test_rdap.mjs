// scripts/test_rdap.mjs
// Probe RDAP for .com TLD — no changes to actor code

const TLD_RDAP_SERVERS = {
  com: 'https://rdap.verisign.com/com/domain',
  net: 'https://rdap.verisign.com/net/domain',
  org: 'https://rdap.org/domain',
  io: 'https://rdap.nic.io/domain',
};

async function main() {
  const domain = process.argv[2] || 'apify.com';
  console.log(`\nProbing RDAP for: ${domain}\n`);

  // 1. Determine TLD and pick known server
  const tld = domain.split('.').pop().toLowerCase();
  const baseUrl = TLD_RDAP_SERVERS[tld];
  if (!baseUrl) {
    console.log(`No known RDAP server for .${tld} — add to TLD_RDAP_SERVERS map`);
    process.exit(1);
  }
  console.log(`RDAP server for .${tld}: ${baseUrl}`);

  // 3. Query RDAP
  const rdapUrl = `${baseUrl}/${domain}`;
  console.log(`Fetching: ${rdapUrl}\n`);

  const resp = await fetch(rdapUrl, {
    headers: { 'User-Agent': 'Company-Intelligence-MCP/1.0 research@red-cars-io.com' }
  });

  if (!resp.ok) {
    console.log(`RDAP returned ${resp.status}`);
    const text = await resp.text();
    console.log('Body:', text.slice(0, 500));
    process.exit(1);
  }

  const rdap = await resp.json();
  console.log('RDAP response keys:', Object.keys(rdap).join(', '));
  console.log('\n--- key fields ---');
  console.log('handle:', rdap.handle);
  console.log('status:', rdap.status);
  console.log('entities count:', rdap.entities?.length);
  console.log('events count:', rdap.events?.length);
  console.log('nameservers count:', rdap.nameservers?.length);

  if (rdap.events) {
    console.log('\n--- events ---');
    rdap.events.forEach(e => {
      console.log(`  ${e.eventType}: ${e.eventDate}`);
    });
  }

  if (rdap.entities) {
    console.log('\n--- entities (first 2) ---');
    rdap.entities.slice(0, 2).forEach(e => {
      console.log(`  handle=${e.handle} roles=${e.roles?.join(',')}`);
      if (e.vcardArray) {
        const vcard = e.vcardArray;
        console.log('  vcardArray:', JSON.stringify(vcard).slice(0, 300));
      }
    });
  }

  if (rdap.nameservers) {
    console.log('\n--- nameservers (first 3) ---');
    rdap.nameservers.slice(0, 3).forEach(ns => {
      console.log(`  ${ns.ldhName}`);
    });
  }

  console.log('\n--- full rdap (truncated) ---');
  console.log(JSON.stringify(rdap, null, 2).slice(0, 3000));
}

main().catch(e => { console.error(e); process.exit(1); });
