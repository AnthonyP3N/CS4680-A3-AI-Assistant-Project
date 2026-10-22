import { Toaster as Sonner } from 'sonner';

function Toaster(props) {
  return (
    <Sonner
      position="bottom-center"
      offset={24}
      mobileOffset={{ bottom: 84 }}
      toastOptions={{
        classNames: {
          toast: 'font-sans !rounded-lg !border-0 !bg-primary !text-primary-foreground !shadow-xl !gap-3',
          description: '!text-primary-foreground/80',
          actionButton: '!h-9 !rounded-md !bg-hl !px-3 !text-sm !font-extrabold !text-[#1d2b3a]',
          closeButton: '!bg-primary !text-primary-foreground !border-primary-foreground/30',
          error: '!bg-destructive !text-white',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
