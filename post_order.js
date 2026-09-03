async function sendOrder() {
  const payload = {
    store_id: '7f39c7fd-b510-44c6-b96a-95b4a3d0676b',
    customer_name: 'Test Fraudulent Order',
    customer_phone: '0555123456',
    wilaya: 'Alger',
    commune: 'Alger Centre',
    quantity: 1,
    unit_price: 5000,
    delivery_price: 500,
    total_price: 5500,
    delivery_type: 'home',
    source: 'form',
    turnstile_token: 'dummy',
    device_fingerprint: 'test_fingerprint_123',
    time_on_page_ms: 100, // Very low, looks like bot
    had_movement: false, // No mouse movement
    form_fill_ms: 50 // Too fast
  }

  const res = await fetch('https://moda.krenix.store/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  console.log(res.status, await res.text())
}

sendOrder()
