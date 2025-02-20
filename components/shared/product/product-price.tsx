import { cn } from "@/lib/utils";

const ProductPrice = ({
  value,
  className,
}: {
  value: number;
  className?: string;
}) => {
  const stringValue = value.toFixed(2);
  const [intValue, floatValue] = stringValue.split(".");
  return (
    /*
      Luôn có class "text-2xl" để đặt kích thước chữ mặc định.
      Nếu className có giá trị, nó sẽ được nối thêm vào.
      Nếu className là undefined hoặc null, thì chỉ có "text-2xl". 
    */
    <p className={cn("text-2xl", className)}>
      <span className="text-xs align-super">$</span>
      {intValue}
      <span className="text-xs align-super">.{floatValue}</span>
    </p>
  );
};

export default ProductPrice;
