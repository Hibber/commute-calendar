import Link from 'next/link';
import React from 'react';

export default function TermsOfService() {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem', fontFamily: 'var(--font-geist-sans)' }}>
      <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>Terms of Service</h1>
      <p><strong>Last Updated:</strong> July 27, 2026</p>
      
      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>1. Agreement to Terms</h2>
        <p>By accessing or using Commute Calendar, you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree with any of these terms, you are prohibited from using or accessing this site.</p>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>2. Use License</h2>
        <p>Permission is granted to temporarily use Commute Calendar for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:</p>
        <ul style={{ paddingLeft: '1.5rem', marginTop: '0.5rem' }}>
          <li>modify or copy the materials;</li>
          <li>use the materials for any commercial purpose, or for any public display (commercial or non-commercial);</li>
          <li>attempt to decompile or reverse engineer any software contained on Commute Calendar;</li>
          <li>remove any copyright or other proprietary notations from the materials; or</li>
          <li>transfer the materials to another person or &ldquo;mirror&rdquo; the materials on any other server.</li>
        </ul>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>3. Disclaimer</h2>
        <p>The materials on Commute Calendar are provided on an &lsquo;as is&rsquo; basis. Commute Calendar makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.</p>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>4. Limitations</h2>
        <p>In no event shall Commute Calendar or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on Commute Calendar, even if Commute Calendar or an authorized representative has been notified orally or in writing of the possibility of such damage.</p>
      </section>

      <div style={{ marginTop: '3rem', paddingTop: '1rem', borderTop: '1px solid #eaeaea', textAlign: 'center' }}>
        <Link href="/" style={{ color: '#0070f3', textDecoration: 'none' }}>&larr; Back to Home</Link>
      </div>
    </div>
  );
}
