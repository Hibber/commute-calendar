from urllib.request import Request, urlopen
from html.parser import HTMLParser

class HTMLFilter(HTMLParser):
    text = ''
    def handle_data(self, data):
        self.text += data + ' '

f = HTMLFilter()
f.feed(urlopen(Request('https://partnermarketinghub.withgoogle.com/brands/google/use-cases/product-co-branding/', headers={'User-Agent': 'Mozilla/5.0'})).read().decode('utf-8'))
start_idx = f.text.find('Referring to Google APIs')
print(f.text[start_idx:start_idx+1000])
