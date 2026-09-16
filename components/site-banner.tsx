import { AnnouncementBar } from "@/components/announcement-bar";
import { getActiveBanners } from "@/lib/queries/banners";

/** Lädt die aktiven Hinweise für die Leiste über der Kopfleiste. */
export async function SiteBanner() {
  const banners = await getActiveBanners();
  return <AnnouncementBar banners={banners} />;
}
