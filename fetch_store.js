async function getStoreId() {
  const res = await fetch('https://moda.krenix.store')
  const html = await res.text()
  // Try to find the store ID in the HTML
  // Usually it's embedded as data-store-id="uuid" or NEXT_DATA
  const match = html.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  if (match) {
    console.log('Store ID:', match[0])
    return match[0]
  }
  console.log('No store ID found in HTML')
}
getStoreId()
