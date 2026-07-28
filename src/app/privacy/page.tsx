import React from 'react';

export default function PrivacyPolicy() {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem', fontFamily: 'var(--font-geist-sans)' }}>
      <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>Privacy Policy</h1>
      <p><strong>Last Updated:</strong> July 27, 2026</p>
      
      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>1. Introduction</h2>
        <p>Welcome to Commute Calendar. We respect your privacy and are committed to protecting your personal data. This privacy policy will inform you as to how we look after your personal data when you visit our website (regardless of where you visit it from) and tell you about your privacy rights and how the law protects you.</p>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>2. The Data We Collect About You</h2>
        <p>We may collect, use, store and transfer different kinds of personal data about you which we have grouped together as follows:</p>
        <ul style={{ paddingLeft: '1.5rem', marginTop: '0.5rem' }}>
          <li><strong>Identity Data</strong> includes first name, last name, username or similar identifier.</li>
          <li><strong>Contact Data</strong> includes email address.</li>
          <li><strong>Technical Data</strong> includes internet protocol (IP) address, your login data, browser type and version, time zone setting and location, browser plug-in types and versions, operating system and platform, and other technology on the devices you use to access this website.</li>
        </ul>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>3. How We Use Your Personal Data</h2>
        <p>We will only use your personal data when the law allows us to. Most commonly, we will use your personal data in the following circumstances:</p>
        <ul style={{ paddingLeft: '1.5rem', marginTop: '0.5rem' }}>
          <li>Where we need to perform the contract we are about to enter into or have entered into with you (e.g., managing your commute schedule).</li>
          <li>Where it is necessary for our legitimate interests (or those of a third party) and your interests and fundamental rights do not override those interests.</li>
          <li>Where we need to comply with a legal obligation.</li>
        </ul>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>4. Data Security</h2>
        <p>We have put in place appropriate security measures to prevent your personal data from being accidentally lost, used or accessed in an unauthorized way, altered or disclosed. In addition, we limit access to your personal data to those employees, agents, contractors and other third parties who have a business need to know.</p>
      </section>
      
      <div style={{ marginTop: '3rem', paddingTop: '1rem', borderTop: '1px solid #eaeaea', textAlign: 'center' }}>
        <a href="/" style={{ color: '#0070f3', textDecoration: 'none' }}>&larr; Back to Home</a>
      </div>
    </div>
  );
}
