import { Metadata } from 'next';
import AmplifyProvider from '../components/AmplifyProvider';
import Navbar from "../components/Navbar";
import './globals.css';

export const metadata: Metadata = {
  title: 'Pluto',
  description: 'Your personal financial coaching app',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AmplifyProvider>
          <Navbar />
          <div className="App">{children}</div>
        </AmplifyProvider>
      </body>
    </html>
  );
}
