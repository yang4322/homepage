#ifndef _IAP_DEFINE_
#define _IAP_DEFINE_
#include "r_cg_macrodriver.h"
#define AM1_IAP_HEAD1        			0x55
#define AM1_IAP_HEAD2       			0xaa

#define   ANDROID_UART_HEAD1   				0XAA
#define   ANDROID_UART_HEAD2  				0X55

#define   CMD   				0X00
#define   ACK 				0X01


enum
{
	ID_send_heat_info =0x10,  
	ID_send_mcu_version_info =0x11,  
	ID_send_key_Value_info=0x12,  
	ID_send_key1_voltage_info=0x13,    		
	ID_send_key2_voltage_info=0x14,    		
	ID_send_wheel1_voltage_info=0x15,    		
	ID_send_wheel2_voltage_info=0x16,    	
};

typedef enum
{
	SEND_TYPE_KEY_INFO =0x10,  
	SEND_TYPE_CAR_INFO=0x20,  
	SEND_TYPE_RADIO_INFO=0x30,  
	SEND_TYPE_SETUP_INFO=0x40, 
	SEND_TYPE_SYSTEM_INFO=0x80,
} Frame_Send_type;


#define ACK1          0xFA //Checksum ok
#define NACK1       0xFB//Checksum NG
#define NACK2       0xFC//Notsupport
#define NACK3       0xFD//Busy

#define MCU_TO_ARM_Start       		0x82
#define MCU_TO_ARM_CHECK_KEY         0x83
#define MCU_TO_ARM_Request_Data     0x84
#define MCU_TO_ARM_COMPLETE           0x85


#define ID_Rev_Linking_Cmd       		  0x10
#define ID_Rev_Quary_Version_Cmd      0x11

#define ID_Rev_Start_upgrade_Cmd       0x82
#define ID_Rev_Esase_flash_Cmd       	  0x83
#define ID_Rev_Write_flash_Cmd       	  0x84
#define ID_Rev_Write_Complete_Cmd       0x85

#define AM1_KEY_VERIFY_ERR      		0X00
#define AM1_KEY_VERIFY_OK	  		0x01
#define AM1_KEY_NO_KEYCODE        	0x02  


#define	XMODEM_BUFFER_SIZE	(132)
#define	LDR_COMMUNICATION_BUFF_SIZE		(80)	

#define  DATA_OK           (1)
#define  DATA_ERR           (0)

#define  FLASH_CHECKSUM_AREA         (0X3FF0)//   (0X1FE00)
#define APP_A_START_ADDRESS          (0x4000UL)
#define APP_A_END_ADDRESS            (0x11FFFUL)
#define APP_B_START_ADDRESS          (0x12000UL)
#define APP_B_END_ADDRESS            (0x1FFFFUL)
#define APP_SLOT_SIZE_BYTES          (0xE000UL)
#define FLASH_BLOCK_SIZE_BYTES       (0x400UL)
#define FLASH_WRITE_CHUNK_BYTES      (64U)
#define IMAGE_HEADER_SIZE_BYTES      (64U)
#define IMAGE_HEADER_FILE_SIZE_OFFSET (48U)
#define IMAGE_HEADER_CRC32_OFFSET    (52U)
#define IMAGE_HEADER_START_ADDR_OFFSET (60U)
#define APP_A_START_BLOCK            ((uint16_t)(APP_A_START_ADDRESS / FLASH_BLOCK_SIZE_BYTES))
#define APP_A_END_BLOCK              ((uint16_t)(APP_A_END_ADDRESS / FLASH_BLOCK_SIZE_BYTES))
#define APP_B_START_BLOCK            ((uint16_t)(APP_B_START_ADDRESS / FLASH_BLOCK_SIZE_BYTES))
#define APP_B_END_BLOCK              ((uint16_t)(APP_B_END_ADDRESS / FLASH_BLOCK_SIZE_BYTES))

typedef enum
{
	BOOT_AREA = 0x2000,
	FLASH_STATR_AREA = 0x3FC0

} ROM_address;

#define APP_IMAGE_START_BLOCK       ((uint16_t)(FLASH_STATR_AREA / FLASH_BLOCK_SIZE_BYTES))


typedef enum
{
	INPUT_KEY_POWER=1,
	INPUT_KEY_VOLINC,
	INPUT_KEY_VOLDEC,	
	INPUT_BACKLIGHT_ON,
	INPUT_BACKLIGHT_OFF,	
	INPUT_BACKLIGHT_ILL_ON,
	INPUT_BACKLIGHT_ILL_OFF,	
	INPUT_CLEAR_RESUME,
	INPUT_KEY_ROT_LEFT ,	
	INPUT_KEY_ROT_RIGHT,	
	INPUT_KEY_UPGRADE,
	INPUT_MAX
}inputkey_t;

void FSL_Erase_App(void);
void FSL_Reset_Address_For_UDS(void);
uint8_t FSL_Writer_App_From_UDS(unsigned char *data, unsigned char size);
uint8_t FSL_Backup_AppToB(void);
uint8_t FSL_Rollback_AppBToA(void);
void Boot_ImageCrc32_Reset(void);
void Boot_ImageCrc32_Consume(uint32_t flash_address, const uint8_t *data, uint8_t size);
uint8_t Boot_ImageCrc32_IsValid(void);
uint32_t Boot_ImageCrc32_GetActual(void);
uint32_t Boot_ImageCrc32_GetExpected(void);
uint8_t Boot_ImageCrc8_GetActual(void);


#endif

