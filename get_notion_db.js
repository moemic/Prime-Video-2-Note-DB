async function getDatabase() {
  const token = 'YOUR_NOTION_TOKEN';
  // ユーザーから提供されたハイフン付きのID
  const id = '6c0e197a-edbb-47c4-bc2e-00809eced2f9';

  console.log('Fetching database info...');
  try {
    const response = await fetch(`https://api.notion.com/v1/databases/${id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
      },
    });

    const data = await response.json();
    if (!response.ok) {
      console.log('ERROR STATUS:', response.status);
      console.log('ERROR BODY:', JSON.stringify(data, null, 2));
    } else {
      console.log('SUCCESS!');
      console.log(JSON.stringify(data.properties, null, 2));
    }
  } catch (err) {
    console.log('FETCH ERROR:', err.message);
  }
}

getDatabase();
