import unittest
import json
from app import app

class BigQueryAppTestCase(unittest.TestCase):
    def setUp(self):
        self.app = app.test_client()
        self.app.testing = True

    def test_index_page(self):
        response = self.app.get('/')
        self.assertEqual(response.status_code, 200)
        html = response.data.decode('utf-8')
        self.assertIn('BigQuery Release Notes', html)
        self.assertIn('Refresh Notes', html)
        self.assertIn('btnSpinner', html)
        self.assertIn('tweetModal', html)

    def test_api_notes_endpoint(self):
        response = self.app.get('/api/notes')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data.get('success'))
        feed_data = data.get('data', {})
        self.assertIn('updates', feed_data)
        self.assertGreater(len(feed_data['updates']), 0)
        
        # Test sample update structure
        first = feed_data['updates'][0]
        self.assertIn('id', first)
        self.assertIn('date', first)
        self.assertIn('category', first)
        self.assertIn('content_html', first)
        self.assertIn('plain_text', first)
        self.assertIn('tweet_draft', first)
        self.assertIn('link', first)
        self.assertTrue(first['tweet_draft'].startswith('🚀 BigQuery'))
        self.assertIn('#BigQuery', first['tweet_draft'])

    def test_api_notes_force_refresh(self):
        response = self.app.get('/api/notes?refresh=1')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data.get('success'))

if __name__ == '__main__':
    unittest.main()
