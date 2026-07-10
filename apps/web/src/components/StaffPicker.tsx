/**
 * Single responsibility: grid of large name chips for staff selection
 * (client-prd §3.4, §11 component inventory). Shared by StaffLogin (initial
 * sign-in) and SwitchUser (mid-session switch) — presentational only.
 */
export interface StaffPickerItem {
  id: string
  name: string
}

export function StaffPicker<T extends StaffPickerItem>({ staff, onPick }: { staff: T[]; onPick: (item: T) => void }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {staff.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onPick(item)}
          className="min-h-12 rounded-xl border border-line bg-surface px-3 text-[15px] font-semibold"
        >
          {item.name}
        </button>
      ))}
    </div>
  )
}
