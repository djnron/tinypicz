import "./globals.css";

export const metadata = {
  title: "Photo Wall",
  description: "A shared photo wall that shrinks as it fills up",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
