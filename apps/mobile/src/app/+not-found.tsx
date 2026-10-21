import { useRouter } from "expo-router";
import { Button, EmptyState, Screen } from "../components/ui";
export default function NotFound() {
  const router = useRouter();
  return (
    <Screen>
      <EmptyState
        title="Không tìm thấy trang"
        description="Liên kết có thể đã thay đổi hoặc không còn khả dụng."
        action={
          <Button title="Về khám phá" onPress={() => router.replace("/")} />
        }
      />
    </Screen>
  );
}
