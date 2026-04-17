/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface MagicLinkEmailProps {
  siteName: string
  token: string
}

export const MagicLinkEmail = ({
  siteName,
  token,
}: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {siteName} sign-in code: {token}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>{siteName.toUpperCase()} // SIGN-IN CODE</Text>
        <Heading style={h1}>Your sign-in code</Heading>
        <Text style={text}>
          Enter this one-time code in the app to sign in. Do not share it with anyone.
        </Text>
        <Section style={codeBox}>
          <Text style={codeStyle}>{token}</Text>
        </Section>
        <Text style={meta}>This code expires in 1 hour.</Text>
        <Text style={footer}>
          If you didn't request this code, you can safely ignore this email — no one will be signed in.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

const main = {
  backgroundColor: '#ffffff',
  fontFamily: '"JetBrains Mono", "Courier New", Courier, monospace',
  margin: '0',
  padding: '0',
}
const container = {
  padding: '32px 28px',
  maxWidth: '480px',
  margin: '0 auto',
  border: '1px solid #e5e5e5',
  borderRadius: '4px',
  backgroundColor: '#fafafa',
}
const eyebrow = {
  fontFamily: '"JetBrains Mono", monospace',
  fontSize: '11px',
  letterSpacing: '2px',
  color: '#d2691e',
  margin: '0 0 16px',
  fontWeight: 'bold' as const,
}
const h1 = {
  fontFamily: '"Space Grotesk", "Helvetica Neue", Arial, sans-serif',
  fontSize: '24px',
  fontWeight: 'bold' as const,
  color: '#1f1f1f',
  margin: '0 0 16px',
  letterSpacing: '-0.5px',
}
const text = {
  fontFamily: '"JetBrains Mono", monospace',
  fontSize: '13px',
  color: '#444444',
  lineHeight: '1.6',
  margin: '0 0 24px',
}
const codeBox = {
  backgroundColor: '#ffffff',
  border: '2px solid #1f1f1f',
  borderRadius: '4px',
  padding: '20px 16px',
  textAlign: 'center' as const,
  margin: '0 0 16px',
}
const codeStyle = {
  fontFamily: '"JetBrains Mono", "Courier New", monospace',
  fontSize: '34px',
  fontWeight: 'bold' as const,
  color: '#1f1f1f',
  letterSpacing: '8px',
  margin: '0',
  lineHeight: '1.2',
}
const meta = {
  fontFamily: '"JetBrains Mono", monospace',
  fontSize: '11px',
  color: '#888888',
  textAlign: 'center' as const,
  letterSpacing: '1px',
  margin: '0 0 32px',
  textTransform: 'uppercase' as const,
}
const footer = {
  fontFamily: '"JetBrains Mono", monospace',
  fontSize: '11px',
  color: '#999999',
  lineHeight: '1.5',
  margin: '0',
  paddingTop: '16px',
  borderTop: '1px solid #e5e5e5',
}
