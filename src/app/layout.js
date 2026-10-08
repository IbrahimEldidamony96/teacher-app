import { ClerkProvider } from "@clerk/nextjs";
import { arSA } from "@clerk/localizations";
import { Cairo } from "next/font/google";
import "./globals.css";

const cairo = Cairo({ subsets: ["arabic", "latin"] });

export const metadata = {
  title: "تطبيق المدرس",
  description: "متابعة الحصص والحضور والاشتراكات للدروس الخصوصية.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <body className={`${cairo.className} antialiased`}>
        <ClerkProvider localization={arSA}>{children}</ClerkProvider>
      </body>
    </html>
  );
}
