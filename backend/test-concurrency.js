const axios = require('axios');

async function test() {
    // Reset product 4 (Headphones) to a known state
    console.log('Firing 100 parallel checkouts for iPhone 15 (currently stock=8)...\n');

    const requests = [];
    for (let i = 0; i < 100; i++) {
        requests.push(
            axios.post('http://localhost:3000/api/checkout', {
                items: [{ productId: 1, quantity: 1 }],
                idempotencyKey: `concurrent-test-${i}-${Date.now()}`
            }).then(() => 'success').catch(() => 'fail')
        );
    }

    const results = await Promise.all(requests);
    const successes = results.filter(r => r === 'success').length;
    const failures = results.filter(r => r === 'fail').length;

    console.log(`✅ Successes: ${successes}`);
    console.log(`❌ Failures: ${failures}`);

    const { data } = await axios.get('http://localhost:3000/api/products/1');
    console.log(`\nFinal stock: ${data.stock}`);
    console.log(`Final reserved: ${data.reserved_stock}`);

    console.log(`\n${successes === 8 ? '✅ PASS — Only 8 orders succeeded (matches available stock)' : '❌ FAIL — Expected 8 successes'}`);
}

test();